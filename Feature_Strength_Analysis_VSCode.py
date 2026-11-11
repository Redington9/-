# =====================================================================
# Feature strength analysis - tests 1 to 5 for one feature  (VS Code)
# =====================================================================
# Checks how strong one feature (default: First_derivative_3) really is,
# using the same data, GPC model and 5-fold CV as
# Internal_1Cardiac_Cohort_VSCode.py.
#
#   Test 1  Distribution    at risk vs no risk: Mann-Whitney U, effect size
#   Test 2  Univariate AUC  the feature ALONE: ROC AUC (95% CI), PR-AUC
#   Test 3  Correlation     is it just a copy of a neighbouring feature?
#   Test 4  Permutation     shuffle it in the test folds -> how much is lost?
#   Test 5  Ablation        retrain WITHOUT it (and without its colour
#                           group) -> paired 95% CI of the loss
#
# How to use in VS Code:
#   1. Install once (in the VS Code terminal):
#        pip install numpy pandas scipy scikit-learn matplotlib
#   2. Put the data CSV next to this file (or set DATA_FILE to its full
#      path; if it is not found a window opens to choose it).
#   3. Run the whole file with the Run button (top right).
#      Tests 1-3 take about a minute. Tests 4-5 retrain the GPC with
#      5-fold CV three times, so they take about 3x one normal run.
#      To go faster, lower "n_restarts_optimizer" (e.g. 2) in CONFIG.
#   4. Tables (CSV) and figures (PNG) are saved to
#      feature_analysis_<feature>/ next to the data file.
# =====================================================================

# %% 0. SETTINGS (edit these)
from pathlib import Path

# File name (looked for next to this script) or a full path, e.g.
#   r"C:\Users\you\Documents\TdP_Organized_Project\data.csv"
DATA_FILE = "All_ECGs_with_coloured_AUC_and_second_derivative_PML_with_outcome.csv"

# The feature to analyse
TARGET_FEATURE = "First_derivative_3"

# Its "colour group" for the group ablation in Test 5. None = automatic:
# First_derivative_k is assumed to be the change between colour area k and
# k+1 (for k=3: green -> lime), so the group is the derivative + both areas.
# Or give the list yourself, e.g.
#   ["First_derivative_3", "sum_of_green_area", "sum_of_lime_area"]
GROUP_FEATURES = None

PERMUTE_ALL_FEATURES = True   # Test 4 for every feature (to rank them); False = target only
N_PERM_REPEATS       = 5      # shuffles per feature in Test 4
RUN_ABLATION         = True   # Test 5 (the slowest part)
SHOW_PLOTS           = False  # True = also open each figure in a window

# %% 1. LOCATE THE DATA FILE
try:
    SCRIPT_DIR = Path(__file__).resolve().parent
except NameError:                 # running cell by cell in the Interactive window
    SCRIPT_DIR = Path.cwd()

DATA_PATH = Path(DATA_FILE)
if not DATA_PATH.is_absolute():
    DATA_PATH = SCRIPT_DIR / DATA_PATH

if not DATA_PATH.exists():
    print("Data file not found:", DATA_PATH)
    print("Choose the CSV file in the window that opens ...")
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        chosen = filedialog.askopenfilename(
            title="Choose the data CSV",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")])
        root.destroy()
    except Exception:
        chosen = ""
    if not chosen:
        raise FileNotFoundError(
            f"Data file not found: {DATA_PATH}. Put the CSV next to this "
            "script or set DATA_FILE to its full path.")
    DATA_PATH = Path(chosen)

BASE_DIR = DATA_PATH.parent
print("Data file:", DATA_PATH)

# %% 2. IMPORTS
import time
import warnings
import numpy as np
import pandas as pd
import matplotlib
if not SHOW_PLOTS:
    matplotlib.use("Agg")          # save figures without opening windows
import matplotlib.pyplot as plt
warnings.filterwarnings("ignore")

from scipy.stats import mannwhitneyu
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold
from sklearn.gaussian_process import GaussianProcessClassifier
from sklearn.gaussian_process.kernels import Matern, WhiteKernel
from sklearn.metrics import roc_auc_score

# np.trapz was renamed to np.trapezoid in NumPy 2.0
_trapz = getattr(np, "trapezoid", None) or np.trapz

# Chart colours
C_RISK, C_NORISK = "#eb6834", "#2a78d6"     # at risk / no risk
C_TARGET, C_OTHER = "#2a78d6", "#b4b2a9"    # analysed feature / the rest
C_INK = "#3d3d3a"

# %% 3. CONFIGURATION (same as the main model)
CONFIG = {
    "skiprows": 0,

    "auc_features": [
        "sum_of_purple_area", "sum_of_blue_area", "sum_of_green_area",
        "sum_of_lime_area", "sum_of_yellow_area", "sum_of_orange_area",
        "sum_of_dark_orange_area", "sum_of_red_area", "sum_of_dark_red_area",
    ],
    "d1_features": [
        "First_derivative_1", "First_derivative_2", "First_derivative_3",
        "First_derivative_4", "First_derivative_5", "First_derivative_6",
        "First_derivative_7", "First_derivative_8",
    ],
    "d2_features": [
        "Purple_Blue_Green", "Blue_Green_Lime", "Green_Lime_Yellow",
        "Lime_Yellow_Orange", "Yellow_Orange_DarkOrange",
        "Orange_DarkOrange_Red", "DarkOrange_Red_DarkRed",
    ],
    "inflection_features": ["inflectionPoint"],
    "label_column": "outcome",
    "positive_class": "at risk",

    "n_splits":     5,
    "shuffle":      True,
    "random_state": 42,
    "use_ard":      True,
    "train_samples": 900,
    "w_risk":       1.0,
    "w_norisk":     1.0,
    "n_restarts_optimizer": 5,
    "max_iter_predict":     300,

    "n_bootstrap": 1000,
    "ci_level":    0.95,
}

# %% 4. SHARED FUNCTIONS (data, metrics, model)
def load_data(cfg):
    df = pd.read_csv(DATA_PATH, skiprows=cfg["skiprows"], header=0,
                     sep=None, engine="python")
    inflection = cfg["inflection_features"] if cfg["use_ard"] else []
    feats = (cfg["auc_features"] + cfg["d1_features"] + cfg["d2_features"]
             + inflection)
    missing = [c for c in feats + [cfg["label_column"]] if c not in df.columns]
    if missing:
        raise ValueError(f"Columns not found: {missing}")
    for c in feats:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    before = len(df)
    df = df.dropna(subset=feats).reset_index(drop=True)
    if before - len(df):
        print("Dropped", before - len(df), "rows with non-numeric values")
    y = (df[cfg["label_column"]].astype(str).str.strip()
         == cfg["positive_class"]).astype(int).values
    X = df[feats].values.astype(float)
    return X, y, feats


def pr_auc_dg(y_true, p):
    """PR-AUC with Davis & Goadrich (2006) interpolation (same as main script)."""
    y_true = np.asarray(y_true).astype(int)
    p = np.asarray(p, dtype=float)
    P = int(y_true.sum())
    if P == 0:
        return np.nan
    order = np.argsort(-p, kind="mergesort")
    ys, ps = y_true[order], p[order]
    tps, fps = np.cumsum(ys), np.cumsum(1 - ys)
    idx = np.r_[np.where(np.diff(ps))[0], len(ys) - 1]
    tps = np.r_[0, tps[idx]].astype(float)
    fps = np.r_[0, fps[idx]].astype(float)
    area = 0.0
    for i in np.where(np.diff(tps) > 0)[0] + 1:   # only steps that add recall
        dTP = tps[i] - tps[i - 1]
        skew = (fps[i] - fps[i - 1]) / dTP
        xs = np.arange(0, int(dTP) + 1, dtype=float)
        num = tps[i - 1] + xs
        den = num + fps[i - 1] + skew * xs
        prec = np.divide(num, den, out=np.ones_like(num), where=den > 0)
        if num[0] == 0 and len(prec) > 1:
            prec[0] = prec[1]
        area += _trapz(prec, num / P)
    return float(area)


def _strat_boot_idx(y, rng):
    pos, neg = np.where(y == 1)[0], np.where(y == 0)[0]
    return np.concatenate([rng.choice(pos, len(pos), replace=True),
                           rng.choice(neg, len(neg), replace=True)])


def bootstrap_ci(y, s, fn, cfg):
    """Stratified bootstrap percentile CI of fn(y, s)."""
    rng = np.random.default_rng(cfg["random_state"])
    vals = []
    for _ in range(cfg["n_bootstrap"]):
        i = _strat_boot_idx(y, rng)
        vals.append(fn(y[i], s[i]))
    a = (1 - cfg["ci_level"]) / 2
    lo, hi = np.nanpercentile(vals, [100 * a, 100 * (1 - a)])
    return float(lo), float(hi)


def paired_bootstrap_diff(y, p_a, p_b, fn, cfg):
    """CI of fn(y, p_a) - fn(y, p_b) on the SAME resampled patients."""
    rng = np.random.default_rng(cfg["random_state"])
    diffs = []
    for _ in range(cfg["n_bootstrap"]):
        i = _strat_boot_idx(y, rng)
        diffs.append(fn(y[i], p_a[i]) - fn(y[i], p_b[i]))
    a = (1 - cfg["ci_level"]) / 2
    lo, hi = np.nanpercentile(diffs, [100 * a, 100 * (1 - a)])
    return float(lo), float(hi)


def make_gpc_subset(X_tr, y_tr, cfg, fold_idx):
    """Keep all at-risk rows, fill up to train_samples with no-risk rows."""
    rng = np.random.default_rng(cfg["random_state"] + fold_idx)
    idx_risk = np.where(y_tr == 1)[0]
    idx_norisk = np.where(y_tr == 0)[0]
    n_norisk = min(cfg["train_samples"] - len(idx_risk), len(idx_norisk))
    idx = np.concatenate([idx_risk,
                          rng.choice(idx_norisk, size=n_norisk, replace=False)])
    rng.shuffle(idx)
    return X_tr[idx], y_tr[idx]


def fit_gpc(X_sub, y_sub, cfg):
    n_feat = X_sub.shape[1]
    if cfg["use_ard"]:
        matern = Matern(length_scale=np.ones(n_feat),
                        length_scale_bounds=(1e-2, 1e3), nu=2.5)
    else:
        matern = Matern(length_scale=1.0, nu=2.5)
    gpc = GaussianProcessClassifier(
        kernel=1.0 * matern + WhiteKernel(noise_level=1e-3),
        n_restarts_optimizer=cfg["n_restarts_optimizer"],
        random_state=cfg["random_state"],
        max_iter_predict=cfg["max_iter_predict"],
    )
    w = np.where(y_sub == 1, cfg["w_risk"], cfg["w_norisk"])
    reps = np.maximum(1, np.round(w / w.min()).astype(int))
    gpc.fit(np.repeat(X_sub, reps, axis=0), np.repeat(y_sub, reps, axis=0))
    return gpc


def run_cv(X, y, cfg, label):
    """5-fold CV -> out-of-fold P(at risk). The folds depend only on y, so
    every feature set gets exactly the same folds and subsamples (paired)."""
    skf = StratifiedKFold(n_splits=cfg["n_splits"], shuffle=cfg["shuffle"],
                          random_state=cfg["random_state"])
    oof = np.full(len(y), np.nan)
    folds = []
    t_all = time.perf_counter()
    for k, (tr, va) in enumerate(skf.split(X, y), start=1):
        t = time.perf_counter()
        sc = StandardScaler().fit(X[tr])
        X_sub, y_sub = make_gpc_subset(sc.transform(X[tr]), y[tr], cfg, k)
        gpc = fit_gpc(X_sub, y_sub, cfg)
        X_va = sc.transform(X[va])
        oof[va] = gpc.predict_proba(X_va)[:, 1]
        folds.append({"gpc": gpc, "X_val": X_va, "val_idx": va})
        print(f"   [{label}] fold {k}/{cfg['n_splits']} "
              f"done in {time.perf_counter() - t:.0f}s")
    print(f"   [{label}] total {(time.perf_counter() - t_all) / 60:.1f} min")
    return oof, folds


def effect_label(delta):
    d = abs(delta)        # Romano et al. (2006) thresholds for Cliff's delta
    if d < 0.147:
        return "negligible"
    if d < 0.33:
        return "small"
    if d < 0.474:
        return "medium"
    return "large"


def auto_group(target, cfg):
    if GROUP_FEATURES is not None:
        return list(GROUP_FEATURES)
    if target.startswith("First_derivative_"):
        k = int(target.rsplit("_", 1)[1])
        areas = cfg["auc_features"]
        if 1 <= k < len(areas):
            return [target, areas[k - 1], areas[k]]
    return [target]


def save_fig(fig, path):
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    if SHOW_PLOTS:
        plt.show()
    plt.close(fig)
    print("   figure ->", path)


def _style(ax):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["left"].set_color("#8a8984")
    ax.spines["bottom"].set_color("#8a8984")
    ax.tick_params(colors=C_INK, labelsize=9)


def _hbar(values, labels, target, title, xlabel, path, err=None, ref=None):
    order = np.argsort(values)
    v = np.asarray(values)[order]
    lab = [labels[i] for i in order]
    colors = [C_TARGET if l == target else C_OTHER for l in lab]
    e = None
    if err is not None:
        err = np.asarray(err)
        e = err[:, order] if err.ndim == 2 else err[order]   # 2 x n = asymmetric CI
    fig, ax = plt.subplots(figsize=(8, 0.28 * len(v) + 1.2))
    ax.barh(range(len(v)), v, color=colors, height=0.7,
            xerr=e, error_kw={"ecolor": C_INK, "elinewidth": 1, "capsize": 2})
    ax.set_yticks(range(len(v)))
    ax.set_yticklabels(lab, fontsize=8)
    for t, l in zip(ax.get_yticklabels(), lab):
        if l == target:
            t.set_fontweight("bold")
    if ref is not None:
        ax.axvline(ref, color="#8a8984", lw=1, ls="--")
    ax.set_xlabel(xlabel, color=C_INK)
    ax.set_title(title, color=C_INK, fontsize=11, loc="left")
    _style(ax)
    save_fig(fig, path)

# %% 5. TESTS 1 + 2: DISTRIBUTION AND UNIVARIATE AUC (every feature)
def test_univariate(X, y, feats, cfg, target, out):
    print("\n=== TEST 1 + 2: each feature on its own ===")
    alpha_bonf = 0.05 / len(feats)
    rows = []
    for j, f in enumerate(feats):
        x = X[:, j]
        auc_raw = roc_auc_score(y, x)
        score = x if auc_raw >= 0.5 else -x        # orient so higher = risk
        auc = max(auc_raw, 1 - auc_raw)
        lo, hi = bootstrap_ci(y, score, roc_auc_score, cfg)
        _, pval = mannwhitneyu(x[y == 1], x[y == 0], alternative="two-sided")
        delta = 2 * auc_raw - 1                    # Cliff's delta = 2*AUC - 1
        rows.append({
            "feature": f,
            "median_at_risk": float(np.median(x[y == 1])),
            "median_no_risk": float(np.median(x[y == 0])),
            "direction": "higher in at risk" if auc_raw >= 0.5 else "lower in at risk",
            "mannwhitney_p": float(pval),
            "significant_bonferroni": bool(pval < alpha_bonf),
            "cliffs_delta": float(delta),
            "effect_size": effect_label(delta),
            "roc_auc": float(auc), "roc_auc_lo": lo, "roc_auc_hi": hi,
            "pr_auc_dg": pr_auc_dg(y, score),
        })
    df = (pd.DataFrame(rows).sort_values("roc_auc", ascending=False)
          .reset_index(drop=True))
    df.insert(0, "rank", np.arange(1, len(df) + 1))
    df.to_csv(out / "test1_2_univariate.csv", index=False)

    r = df[df["feature"] == target].iloc[0]
    j = feats.index(target)
    score = X[:, j] if r["direction"].startswith("higher") else -X[:, j]
    pr_lo, pr_hi = bootstrap_ci(y, score, pr_auc_dg, cfg)

    print(f"Bonferroni alpha = 0.05 / {len(feats)} = {alpha_bonf:.4f}")
    print(df[["rank", "feature", "roc_auc", "roc_auc_lo", "roc_auc_hi",
              "pr_auc_dg", "cliffs_delta", "effect_size", "mannwhitney_p"]]
          .head(10).to_string(index=False, float_format=lambda v: f"{v:.4g}"))
    print(f"\n{target}: rank {int(r['rank'])} of {len(df)} | "
          f"ROC AUC {r['roc_auc']:.4f} [{r['roc_auc_lo']:.4f} - {r['roc_auc_hi']:.4f}] | "
          f"PR-AUC {r['pr_auc_dg']:.4f} [{pr_lo:.4f} - {pr_hi:.4f}] "
          f"(baseline {y.mean():.4f}) | {r['direction']} | "
          f"Cliff's delta {r['cliffs_delta']:.3f} ({r['effect_size']}) | "
          f"p = {r['mannwhitney_p']:.2e}")

    # Figure: distribution of the target in both groups
    x = X[:, j]
    rng = np.random.default_rng(0)
    fig, ax = plt.subplots(figsize=(6, 4.5))
    data = [x[y == 0], x[y == 1]]
    bp = ax.boxplot(data, widths=0.5, showfliers=False, patch_artist=True,
                    medianprops={"color": C_INK, "lw": 2})
    for patch, c in zip(bp["boxes"], (C_NORISK, C_RISK)):
        patch.set_facecolor(c)
        patch.set_alpha(0.25)
        patch.set_edgecolor(c)
    for pos, (d, c) in enumerate(zip(data, (C_NORISK, C_RISK)), start=1):
        if len(d) > 800:                       # thin the large group for clarity
            d = rng.choice(d, 800, replace=False)
        ax.scatter(pos + rng.uniform(-0.15, 0.15, len(d)), d, s=6,
                   color=c, alpha=0.45, linewidths=0)
    ax.set_xticks([1, 2])
    ax.set_xticklabels([f"no risk (n={int((y == 0).sum())})",
                        f"at risk (n={int(y.sum())})"])
    ax.set_ylabel(target, color=C_INK)
    ax.set_title(f"{target}: AUC {r['roc_auc']:.3f}, "
                 f"Cliff's delta {r['cliffs_delta']:.2f}, p={r['mannwhitney_p']:.1e}",
                 color=C_INK, fontsize=10, loc="left")
    _style(ax)
    save_fig(fig, out / "test1_distribution.png")

    _hbar(df["roc_auc"].values, list(df["feature"]), target,
          "Test 2 - ROC AUC of each feature ALONE (95% CI)", "ROC AUC",
          out / "test2_univariate_auc.png",
          err=np.vstack([df["roc_auc"] - df["roc_auc_lo"],
                         df["roc_auc_hi"] - df["roc_auc"]]), ref=0.5)
    return df, (pr_lo, pr_hi)

# %% 6. TEST 3: CORRELATION WITH THE OTHER FEATURES
def test_correlation(X, feats, cfg, target, out):
    print("\n=== TEST 3: correlation (Spearman) with the other features ===")
    df_x = pd.DataFrame(X, columns=feats)
    rho = df_x.corr(method="spearman")[target].drop(target)
    df = pd.DataFrame({"feature": rho.index, "spearman_rho": rho.values,
                       "abs_rho": rho.abs().values})
    df = df.sort_values("abs_rho", ascending=False).reset_index(drop=True)
    df.to_csv(out / "test3_correlation.csv", index=False)
    print(df.head(8).to_string(index=False, float_format=lambda v: f"{v:.3f}"))

    # Does the derivative look like (next area - previous area)?
    group = auto_group(target, cfg)
    r_def = None
    if target.startswith("First_derivative_") and len(group) == 3:
        a, b = df_x[group[1]], df_x[group[2]]
        r_diff = df_x[target].corr(b - a, method="spearman")
        r_ratio = df_x[target].corr(b / a.replace(0, np.nan), method="spearman")
        print(f"\nDefinition check: Spearman with ({group[2]} - {group[1]}) = "
              f"{r_diff:.3f}, with ({group[2]} / {group[1]}) = {r_ratio:.3f}")
        print("   (close to +1 or -1 means the derivative is basically that quantity)")
        r_def = max(abs(r_diff), abs(r_ratio))

    _hbar(df["spearman_rho"].abs().values, list(df["feature"]), None,
          f"Test 3 - |Spearman correlation| of {target} with each feature",
          "|rho|  (above 0.8 = nearly the same information)",
          out / "test3_correlation.png", ref=0.8)
    return df, r_def

# %% 7. TEST 4: PERMUTATION IMPORTANCE (in the CV test folds)
def test_permutation(y, oof_full, folds, feats, cfg, target, out):
    print("\n=== TEST 4: permutation importance ===")
    base_pr, base_roc = pr_auc_dg(y, oof_full), roc_auc_score(y, oof_full)
    print(f"Full model, pooled OOF: ROC AUC {base_roc:.4f}, PR-AUC {base_pr:.4f}")
    rng = np.random.default_rng(cfg["random_state"])
    to_test = feats if PERMUTE_ALL_FEATURES else [target]
    rows = []
    t = time.perf_counter()
    for f in to_test:
        j = feats.index(f)
        d_pr, d_roc = [], []
        for _ in range(N_PERM_REPEATS):
            p = np.empty_like(oof_full)
            for fd in folds:
                Xp = fd["X_val"].copy()
                Xp[:, j] = rng.permutation(Xp[:, j])
                p[fd["val_idx"]] = fd["gpc"].predict_proba(Xp)[:, 1]
            d_pr.append(base_pr - pr_auc_dg(y, p))
            d_roc.append(base_roc - roc_auc_score(y, p))
        rows.append({"feature": f,
                     "pr_auc_drop": float(np.mean(d_pr)),
                     "pr_auc_drop_sd": float(np.std(d_pr, ddof=1)) if len(d_pr) > 1 else 0.0,
                     "roc_auc_drop": float(np.mean(d_roc)),
                     "roc_auc_drop_sd": float(np.std(d_roc, ddof=1)) if len(d_roc) > 1 else 0.0})
    print(f"   permutations done in {(time.perf_counter() - t) / 60:.1f} min")
    df = (pd.DataFrame(rows).sort_values("pr_auc_drop", ascending=False)
          .reset_index(drop=True))
    df.insert(0, "rank", np.arange(1, len(df) + 1))
    df.to_csv(out / "test4_permutation.csv", index=False)
    print(df.head(10).to_string(index=False, float_format=lambda v: f"{v:.4f}"))

    if len(df) > 1:
        _hbar(df["pr_auc_drop"].values, list(df["feature"]), target,
              f"Test 4 - drop in PR-AUC when each feature is shuffled "
              f"(mean ± SD, {N_PERM_REPEATS} shuffles)",
              "PR-AUC lost (higher = model relies on it more)",
              out / "test4_permutation.png",
              err=df["pr_auc_drop_sd"].values, ref=0)
    return df, base_pr, base_roc

# %% 8. TEST 5: ABLATION (retrain without the feature / its group)
def test_ablation(X, y, feats, cfg, target, group, oof_full, out):
    print("\n=== TEST 5: ablation (retrain without the feature) ===")
    variants = [(f"without {target}", [target])]
    if len(group) > 1:
        variants.append((f"without group ({', '.join(group)})", group))

    rows = [{"model": "all features", "n_features": len(feats),
             "roc_auc": roc_auc_score(y, oof_full), "pr_auc_dg": pr_auc_dg(y, oof_full)}]
    oofs = []
    for name, drop in variants:
        keep = [i for i, f in enumerate(feats) if f not in drop]
        print(f"-> training {name} ...")
        oof, _ = run_cv(X[:, keep], y, cfg, name)
        oofs.append(oof)
        roc_lo, roc_hi = paired_bootstrap_diff(y, oof_full, oof, roc_auc_score, cfg)
        pr_lo, pr_hi = paired_bootstrap_diff(y, oof_full, oof, pr_auc_dg, cfg)
        roc, pr = roc_auc_score(y, oof), pr_auc_dg(y, oof)
        rows.append({"model": name, "n_features": len(keep),
                     "roc_auc": roc, "pr_auc_dg": pr,
                     "roc_auc_loss": rows[0]["roc_auc"] - roc,
                     "roc_auc_loss_lo": roc_lo, "roc_auc_loss_hi": roc_hi,
                     "pr_auc_loss": rows[0]["pr_auc_dg"] - pr,
                     "pr_auc_loss_lo": pr_lo, "pr_auc_loss_hi": pr_hi})
    df = pd.DataFrame(rows)
    df.to_csv(out / "test5_ablation.csv", index=False)
    print(df.to_string(index=False, float_format=lambda v: f"{v:.4f}"))
    print("   loss = full model minus reduced model; if its 95% CI is entirely "
          "above 0, removing the feature really hurts.")

    # Figure: PR-AUC loss with paired CI
    sub = df.iloc[1:]
    fig, ax = plt.subplots(figsize=(8, 1.3 * len(sub) + 1.6))
    ypos = np.arange(len(sub))
    for k, (_, r) in enumerate(sub.iterrows()):
        ax.plot([r["pr_auc_loss_lo"], r["pr_auc_loss_hi"]], [k, k],
                color=C_TARGET, lw=2)
        ax.plot(r["pr_auc_loss"], k, "o", color=C_TARGET, ms=9,
                markeredgecolor="white", markeredgewidth=2)
    ax.axvline(0, color="#8a8984", lw=1, ls="--")
    ax.set_yticks(ypos)
    ax.set_yticklabels([m.replace(" (", ":\n").replace(", ", ",\n").rstrip(")")
                        for m in sub["model"]], fontsize=8)
    ax.set_ylim(-0.6, len(sub) - 0.4)
    ax.set_xlabel("PR-AUC lost vs full model (95% paired bootstrap CI)", color=C_INK)
    ax.set_title("Test 5 - ablation\n(right of the dashed line = removing it hurts)",
                 color=C_INK, fontsize=10, loc="left")
    _style(ax)
    save_fig(fig, out / "test5_ablation.png")
    return df

# %% 9. SUMMARY
def print_summary(target, uni, corr, perm, abl, n_feats, r_def=None):
    print("\n" + "=" * 70)
    print(f"SUMMARY for {target}")
    print("=" * 70)
    ok = lambda c: "PASS" if c else "----"
    r = uni[uni["feature"] == target].iloc[0]

    c1 = bool(r["significant_bonferroni"]) and r["effect_size"] in ("medium", "large")
    print(f"[{ok(c1)}] Test 1  different between groups: p={r['mannwhitney_p']:.1e}, "
          f"Cliff's delta {r['cliffs_delta']:.2f} ({r['effect_size']}), {r['direction']}")

    c2 = r["roc_auc_lo"] > 0.5
    print(f"[{ok(c2)}] Test 2  alone: ROC AUC {r['roc_auc']:.3f} "
          f"[{r['roc_auc_lo']:.3f}-{r['roc_auc_hi']:.3f}], rank {int(r['rank'])}/{n_feats}")

    top = corr.iloc[0]
    c3 = top["abs_rho"] < 0.8
    print(f"[{ok(c3)}] Test 3  not a copy of another feature: highest |rho| = "
          f"{top['abs_rho']:.2f} with {top['feature']}")

    if perm is not None:
        p = perm[perm["feature"] == target].iloc[0]
        c4 = p["pr_auc_drop"] > 2 * p["pr_auc_drop_sd"] and p["pr_auc_drop"] > 0
        rank = f", rank {int(p['rank'])}/{len(perm)}" if len(perm) > 1 else ""
        print(f"[{ok(c4)}] Test 4  model relies on it: PR-AUC drop "
              f"{p['pr_auc_drop']:.4f} ± {p['pr_auc_drop_sd']:.4f}{rank}")

    if abl is not None:
        for _, a in abl.iloc[1:].iterrows():
            c5 = a["pr_auc_loss_lo"] > 0 or a["roc_auc_loss_lo"] > 0
            print(f"[{ok(c5)}] Test 5  {a['model']}: PR-AUC loss {a['pr_auc_loss']:.4f} "
                  f"[{a['pr_auc_loss_lo']:.4f} to {a['pr_auc_loss_hi']:.4f}], "
                  f"ROC AUC loss {a['roc_auc_loss']:.4f} "
                  f"[{a['roc_auc_loss_lo']:.4f} to {a['roc_auc_loss_hi']:.4f}]")
    print("PASS = evidence for the feature's strength; ---- = no evidence from this test.")
    if abl is not None and (abl.iloc[1:]["pr_auc_loss"] < 0).any():
        print("Note: a NEGATIVE loss means the reduced model scored higher - the")
        print("removed features were not needed, or their information is still there.")
    if r_def is not None and r_def > 0.95:
        print(f"WARNING: {target} is almost exactly computed from the colour areas")
        print(f"(definition check |rho| = {r_def:.3f}). The model can rebuild it from")
        print("the remaining columns, so Test 5 CANNOT remove its information and a")
        print("small loss there does NOT mean the feature is weak. Rely on Tests 2 and 4.")
    else:
        print("Note: if Test 5 (single feature) shows no loss but Test 3 shows a highly")
        print("correlated feature, the neighbour can replace it - check the group ablation.")

# %% 10. MAIN
def main():
    cfg = CONFIG
    X, y, feats = load_data(cfg)
    if TARGET_FEATURE not in feats:
        raise ValueError(f"{TARGET_FEATURE} is not one of the model features: {feats}")
    group = auto_group(TARGET_FEATURE, cfg)
    out = BASE_DIR / f"feature_analysis_{TARGET_FEATURE}"
    out.mkdir(parents=True, exist_ok=True)

    print(f"Patients: {len(y)} | at risk: {int(y.sum())} ({y.mean():.1%}) | "
          f"features: {len(feats)}")
    print(f"Feature analysed: {TARGET_FEATURE} | colour group: {group}")
    if GROUP_FEATURES is None and len(group) == 3:
        print("   (group assumes First_derivative_k = change between colour area "
              "k and k+1 - see the definition check in Test 3)")
    print("Results folder:", out)

    uni, _ = test_univariate(X, y, feats, cfg, TARGET_FEATURE, out)
    corr, r_def = test_correlation(X, feats, cfg, TARGET_FEATURE, out)

    print("\n-> training the full model (5-fold CV) for Tests 4 and 5 ...")
    oof_full, folds = run_cv(X, y, cfg, "all features")
    perm, _, _ = test_permutation(y, oof_full, folds, feats, cfg, TARGET_FEATURE, out)
    abl = (test_ablation(X, y, feats, cfg, TARGET_FEATURE, group, oof_full, out)
           if RUN_ABLATION else None)

    print_summary(TARGET_FEATURE, uni, corr, perm, abl, len(feats), r_def)
    print("\nAll tables and figures saved in:", out)


if __name__ == "__main__":
    main()
