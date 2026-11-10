# =====================================================================
# Internal cardiac cohort - GPC with 5-fold CV  (VS Code version)
# =====================================================================
# How to use in VS Code:
#   1. Install once (in the VS Code terminal):
#        pip install numpy pandas scikit-learn joblib
#   2. Put the data CSV in the same folder as this file, or set DATA_FILE
#      below to its full path. If it is not found, a window opens so you can
#      choose the CSV.
#   3. Run the whole file with the Run button (top right), or run it cell by
#      cell with "Run Cell" above each "# %%" line (needs the Jupyter
#      extension).
#   4. The trained model is saved to saved_models/internal_model.joblib next
#      to the data file.
# Same model, settings and results as the Colab notebook.
# =====================================================================

# %% 0. SETTINGS (edit these)
from pathlib import Path

# File name (looked for next to this script) or a full path, e.g.
#   r"C:\Users\you\Documents\TdP_Organized_Project\data.csv"
DATA_FILE = "All_ECGs_with_coloured_AUC_and_second_derivative_PML_with_outcome.csv"

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

BASE_DIR = DATA_PATH.parent      # the model is saved next to the data
print("Data file:", DATA_PATH)

# %% 2. IMPORTS
import numpy as np
import pandas as pd
import warnings
import joblib
warnings.filterwarnings("ignore")

from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold
from sklearn.gaussian_process import GaussianProcessClassifier
from sklearn.gaussian_process.kernels import Matern, WhiteKernel
from sklearn.metrics import (
    precision_score, recall_score, balanced_accuracy_score,   # original
    f1_score, matthews_corrcoef, accuracy_score, roc_auc_score,  # added
)

# np.trapz was renamed to np.trapezoid in NumPy 2.0
_trapz = getattr(np, "trapezoid", None) or np.trapz

# %% 3. CONFIGURATION
CONFIG = {
    "excel_path":     str(DATA_PATH),
    "sheet_name":     0,
    "skiprows":       0,            # the CSV's first row holds the column names

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

    "n_splits":     5,  # 5
    "shuffle":      True,
    "random_state": 42,

    # use_ard=True -> one length-scale per feature (needed for feature-relevance
    # analysis). Set False to reproduce the original isotropic-kernel results.
    "use_ard": True,

    # Number of samples used to train the GPC
    "train_samples": 900,  # 900

    # Decision threshold
    "threshold":  0.55,

    # Class weights
    "w_risk":     1.0,
    "w_norisk":   1.0,

    "n_restarts_optimizer": 5,  # 5
    "max_iter_predict":     300,

    # Bootstrap confidence intervals for ROC AUC / PR-AUC (pooled OOF)
    "n_bootstrap": 1000,
    "ci_level":    0.95,
}

# %% 4. LOAD DATA
def load_data(cfg):
    df = pd.read_csv(
        cfg["excel_path"],
        skiprows=cfg["skiprows"],
        header=0,
        sep=None, engine="python",   # detects ',' or ';' automatically
    )

    included_inflection = cfg["inflection_features"] if cfg["use_ard"] else []
    all_features = (
        cfg["auc_features"] + cfg["d1_features"] + cfg["d2_features"]
        + included_inflection
    )

    missing_cols = [c for c in all_features + [cfg["label_column"]]
                     if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Columns not found: {missing_cols}\n"
                          f"Available: {list(df.columns)}")

    for col in all_features:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    before = len(df)
    df = df.dropna(subset=all_features).reset_index(drop=True)
    if before - len(df):
        print("Dropped", before - len(df), "rows with non-numeric values")

    y = (df[cfg["label_column"]].astype(str).str.strip()
         == cfg["positive_class"]).astype(int).values
    X = df[all_features].values.astype(float)

    return X, y, all_features, df

# %% 5. EXTRA METRICS: PR-AUC (Davis-Goadrich) + bootstrap CI
def pr_auc_davis_goadrich(y_true, p):
    """
    Area under the Precision-Recall curve using Davis & Goadrich (2006)
    interpolation. Between two consecutive PR points A and B, the points in
    between are interpolated in (TP, FP) space (where the relationship is
    linear), then converted to (Recall, Precision). This avoids the
    over-optimistic result of naive linear interpolation in PR space.
    """
    y_true = np.asarray(y_true).astype(int)
    p      = np.asarray(p, dtype=float)
    P      = int(y_true.sum())
    if P == 0:
        return np.nan

    order    = np.argsort(-p, kind="mergesort")
    y_sorted = y_true[order]
    p_sorted = p[order]

    tps = np.cumsum(y_sorted)
    fps = np.cumsum(1 - y_sorted)

    # keep one point per distinct score (handles ties correctly)
    distinct = np.where(np.diff(p_sorted))[0]
    idx = np.r_[distinct, len(y_sorted) - 1]
    tps = np.r_[0, tps[idx]].astype(float)
    fps = np.r_[0, fps[idx]].astype(float)

    area = 0.0
    for i in range(1, len(tps)):
        dTP = tps[i] - tps[i - 1]
        if dTP <= 0:
            continue                    # recall unchanged -> zero area
        skew = (fps[i] - fps[i - 1]) / dTP
        xs   = np.arange(0, int(dTP) + 1, dtype=float)
        num  = tps[i - 1] + xs
        den  = num + fps[i - 1] + skew * xs
        prec = np.divide(num, den, out=np.ones_like(num), where=den > 0)
        if num[0] == 0 and len(prec) > 1:
            prec[0] = prec[1]           # precision undefined at (0,0)
        rec = num / P
        area += _trapz(prec, rec)
    return float(area)


def bootstrap_ci(y_true, scores, metric_fn, n_boot, level, seed):
    """Stratified bootstrap percentile CI for a threshold-free metric."""
    rng = np.random.default_rng(seed)
    y_true = np.asarray(y_true)
    scores = np.asarray(scores)
    pos = np.where(y_true == 1)[0]
    neg = np.where(y_true == 0)[0]

    vals = []
    for _ in range(n_boot):
        idx = np.concatenate([
            rng.choice(pos, size=len(pos), replace=True),
            rng.choice(neg, size=len(neg), replace=True),
        ])
        vals.append(metric_fn(y_true[idx], scores[idx]))

    alpha = (1.0 - level) / 2.0
    lo, hi = np.nanpercentile(vals, [100 * alpha, 100 * (1 - alpha)])
    return float(lo), float(hi)


def compute_metrics(y_true, y_pred, p_risk):
    """All metrics for one set of predictions."""
    return {
        "Balanced Accuracy": balanced_accuracy_score(y_true, y_pred),
        "Recall":            recall_score(y_true, y_pred, zero_division=0),
        "Specificity":       recall_score(y_true, y_pred, pos_label=0, zero_division=0),
        "Precision":         precision_score(y_true, y_pred, zero_division=0),
        "F1":                f1_score(y_true, y_pred, zero_division=0),
        "MCC":               matthews_corrcoef(y_true, y_pred),
        "Accuracy":          accuracy_score(y_true, y_pred),
        "ROC AUC":           roc_auc_score(y_true, p_risk),
        "PR-AUC (DG)":       pr_auc_davis_goadrich(y_true, p_risk),
    }

# %% 6. GPC SUBSAMPLE + FIT
# GPC SUBSAMPLE (from one fold's TRAINING portion only - no leakage)
def make_gpc_subset(X_train_sc, y_train, cfg, fold_idx):
    # Random generator, seeded per-fold for reproducibility
    rng        = np.random.default_rng(cfg["random_state"] + fold_idx)
    # Indices of At-risk vs No-risk samples in this fold's training data
    idx_risk   = np.where(y_train == 1)[0]
    idx_norisk = np.where(y_train == 0)[0]

    # Keep all At-risk samples
    n_risk_keep   = len(idx_risk)
    # Fill the rest of the budget with No-risk samples
    n_norisk_keep = min(cfg["train_samples"] - n_risk_keep, len(idx_norisk))

    # Randomly sample No-risk indices, combine with At-risk, then shuffle
    idx_norisk_sub = rng.choice(idx_norisk, size=n_norisk_keep, replace=False)
    idx_all        = np.concatenate([idx_risk, idx_norisk_sub])
    rng.shuffle(idx_all)

    return X_train_sc[idx_all], y_train[idx_all]

# FIT GPC (Matern + WhiteKernel, class weighting via replication)
def fit_gpc(X_sub, y_sub, cfg):
    sample_weight = np.where(y_sub == 1, cfg["w_risk"], cfg["w_norisk"])

    n_features = X_sub.shape[1]
    if cfg.get("use_ard", False):
        # ARD kernel: a separate length-scale per feature, learned by the
        # optimiser.
        matern = Matern(length_scale=np.ones(n_features),
                         length_scale_bounds=(1e-2, 1e3), nu=2.5)
    else:
        # Single shared length-scale (isotropic).
        matern = Matern(length_scale=1.0, nu=2.5)

    kernel = 1.0 * matern + WhiteKernel(noise_level=1e-3)
    gpc = GaussianProcessClassifier(
        kernel=kernel,
        n_restarts_optimizer=cfg["n_restarts_optimizer"],
        random_state=cfg["random_state"],
        max_iter_predict=cfg["max_iter_predict"],
    )

    # Apply class weighting by repeating samples
    reps       = np.maximum(1, np.round(sample_weight / sample_weight.min()).astype(int))
    X_weighted = np.repeat(X_sub, reps, axis=0)
    y_weighted = np.repeat(y_sub, reps, axis=0)

    gpc.fit(X_weighted, y_weighted)
    return gpc

# EXTRACT ARD LENGTH-SCALES (per-feature relevance source)
def extract_length_scales(fitted_kernel, n_features):
    """
    Extract the fitted ARD length-scale for each feature.
    Shorter length-scales indicate greater feature relevance.
    """
    params = fitted_kernel.get_params()

    # Extract per-feature ARD length-scales
    for name, val in params.items():
        if name.endswith("length_scale") and not name.endswith("length_scale_bounds"):
            arr = np.atleast_1d(np.asarray(val, dtype=float))
            if arr.size == n_features:
                return arr

    # Handle a single shared length-scale
    for name, val in params.items():
        if name.endswith("length_scale") and not name.endswith("length_scale_bounds"):
            arr = np.atleast_1d(np.asarray(val, dtype=float))
            if arr.size == 1:
                return np.full(n_features, float(arr[0]))
    return None

# %% 7. RUN A SINGLE FOLD
def run_fold(fold_idx, X_tr_raw, y_tr, X_val_raw, y_val, cfg):

    # Standardise using training data only
    scaler   = StandardScaler()
    X_tr_sc  = scaler.fit_transform(X_tr_raw)
    X_val_sc = scaler.transform(X_val_raw)

    # Create subset and fit the GPC
    X_sub, y_sub = make_gpc_subset(X_tr_sc, y_tr, cfg, fold_idx)
    gpc = fit_gpc(X_sub, y_sub, cfg)

    # Generate predictions
    p_risk = gpc.predict_proba(X_val_sc)[:, 1]
    y_pred = (p_risk >= cfg["threshold"]).astype(int)

    # Calculate prediction confidence
    confidence = np.abs(p_risk - 0.5) * 2

    # Calculate evaluation metrics (threshold-based + threshold-free)
    m = compute_metrics(y_val, y_pred, p_risk)

    # Extract ARD length-scales
    length_scales = (extract_length_scales(gpc.kernel_, X_sub.shape[1])
                      if cfg.get("use_ard", False) else None)

    print("Fold", fold_idx,
          "BalAcc", round(m["Balanced Accuracy"], 4),
          "Recall", round(m["Recall"], 4),
          "Specificity", round(m["Specificity"], 4),
          "Precision", round(m["Precision"], 4),
          "F1", round(m["F1"], 4),
          "MCC", round(m["MCC"], 4),
          "Acc", round(m["Accuracy"], 4),
          "ROC-AUC", round(m["ROC AUC"], 4),
          "PR-AUC", round(m["PR-AUC (DG)"], 4))

    out = {
        "fold":          fold_idx,
        "mean_conf":     float(confidence.mean()),
        "pred_at_risk":  int(y_pred.sum()),
        "pred_no_risk":  int((y_pred == 0).sum()),
        "p_risk":        p_risk,
        "y_pred":        y_pred,
        "confidence":    confidence,
        "length_scales": length_scales,
    }
    out.update(m)
    return out

# %% 8. REPORTING
# REPORTING - per-fold results + Mean / SD / Min / Max
METRIC_KEYS = [
    "Balanced Accuracy", "Recall", "Specificity", "Precision",
    "F1", "MCC", "Accuracy", "ROC AUC", "PR-AUC (DG)",
]

def report_folds(fold_results):

    # Calculate summary statistics across folds
    print("Metric Summary")
    stats = {}
    for key in METRIC_KEYS:
        vals = np.array([r[key] for r in fold_results], dtype=float)
        stats[key] = {
            "Mean": float(vals.mean()),
            "Std":  float(vals.std(ddof=1)),
            "Min":  float(vals.min()),
            "Max":  float(vals.max()),
        }
        print(key, round(stats[key]["Mean"], 4), round(stats[key]["Std"], 4),
              round(stats[key]["Min"], 4), round(stats[key]["Max"], 4))

    return stats

# FEATURE RELEVANCE FROM ARD LENGTH-SCALES
def report_length_scales(fold_results, all_features, cfg):

    # Collect ARD length-scales from all folds
    ls_list = [r["length_scales"] for r in fold_results
               if r.get("length_scales") is not None]
    if not ls_list:
        print("No ARD length-scales available")
        return None

    # Calculate feature relevance from inverse length-scales
    LS  = np.vstack(ls_list)
    REL = 1.0 / LS

    # Summarise relevance across folds
    df = pd.DataFrame({
        "feature":           all_features,
        "length_scale_mean": LS.mean(axis=0),
        "relevance_mean":    REL.mean(axis=0),
        "relevance_sd":      REL.std(axis=0, ddof=1),
    })

    # Normalise and rank feature relevance
    m = float(df["relevance_mean"].max())
    df["relevance_norm"] = df["relevance_mean"] / (m if m else 1.0)
    df = df.sort_values("relevance_mean", ascending=False).reset_index(drop=True)

    # Print the five most relevant features
    print("Top Features")
    for i, row in df.head(5).iterrows():
        print(row["feature"], round(row["relevance_mean"], 4))

    # Report the InflectionPoint feature separately
    for inf_feat in cfg["inflection_features"]:
        if (df["feature"] == inf_feat).any():
            rank = int(df.index[df["feature"] == inf_feat][0]) + 1
            row  = df[df["feature"] == inf_feat].iloc[0]
            print("InflectionPoint rank", rank, round(row["relevance_mean"], 4))

    return df

# CONFIDENCE ANALYSIS
def quantify_confidence(p_risk, confidence):
    print("Mean P(At Risk)", round(p_risk.mean(), 4))
    print("Mean Confidence", round(confidence.mean(), 4))

    high = int((confidence >= 0.8).sum())
    med  = int(((confidence >= 0.6) & (confidence < 0.8)).sum())
    low  = int((confidence <  0.6).sum())

    print("Confidence tiers - High", high, "Medium", med, "Low", low)

# AGGREGATE OUT-OF-FOLD (OOF) SUMMARY
def summarize_oof_results(y_all, oof_pred, oof_p, oof_conf, stats):

    # Calculate pooled OOF performance metrics
    pooled = compute_metrics(y_all, oof_pred, oof_p)

    print("Total", len(y_all), "TrueAtRisk", int(y_all.sum()),
          "PredAtRisk", int((oof_pred == 1).sum()),
          "Correct", int((y_all == oof_pred).sum()))

    print("Pooled OOF Metrics")
    for key, val in pooled.items():
        print(key, round(val, 4))

    return pooled

# ROC AUC / PR-AUC WITH CONFIDENCE INTERVALS (pooled OOF)
def report_auc_confidence(y_all, oof_p, cfg):
    n_boot = cfg["n_bootstrap"]
    level  = cfg["ci_level"]
    seed   = cfg["random_state"]
    pct    = int(round(level * 100))

    roc = roc_auc_score(y_all, oof_p)
    roc_lo, roc_hi = bootstrap_ci(y_all, oof_p, roc_auc_score,
                                  n_boot, level, seed)

    pr = pr_auc_davis_goadrich(y_all, oof_p)
    pr_lo, pr_hi = bootstrap_ci(y_all, oof_p, pr_auc_davis_goadrich,
                                n_boot, level, seed)

    baseline = float(y_all.mean())   # PR-AUC of a random classifier = prevalence

    print("AUC with", str(pct) + "% bootstrap CI (", n_boot, "resamples )")
    print("ROC AUC", round(roc, 4), "[", round(roc_lo, 4), "-", round(roc_hi, 4), "]")
    print("PR-AUC (Davis-Goadrich)", round(pr, 4),
          "[", round(pr_lo, 4), "-", round(pr_hi, 4), "]",
          "baseline (prevalence)", round(baseline, 4))

    return {
        "ROC AUC": (roc, roc_lo, roc_hi),
        "PR-AUC (DG)": (pr, pr_lo, pr_hi),
        "PR baseline": baseline,
    }

# THRESHOLD SWEEP
def threshold_sweep(y_all, oof_p, cfg,
                     thresholds=np.arange(0.05, 0.96, 0.05),
                     beta=2.0):
    print("Threshold Sweep")

    b2    = beta ** 2
    n_neg = int((y_all == 0).sum())
    rows  = []
    for thr in thresholds:
        y_pred = (oof_p >= thr).astype(int)
        tp = int(((y_pred == 1) & (y_all == 1)).sum())
        fp = int(((y_pred == 1) & (y_all == 0)).sum())
        fn = int(((y_pred == 0) & (y_all == 1)).sum())
        tn = n_neg - fp

        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec  = tp / (tp + fn) if (tp + fn) else 0.0
        spec = tn / (tn + fp) if (tn + fp) else 0.0
        fb   = ((1 + b2) * prec * rec / (b2 * prec + rec)
                if (b2 * prec + rec) else 0.0)

        flag = " current" if abs(thr - cfg["threshold"]) < 1e-9 else ""
        print(round(thr, 2), round(prec, 4), round(rec, 4), round(spec, 4), round(fb, 4), flag)

        rows.append({
            "Threshold": round(float(thr), 2),
            "Precision": prec, "Recall": rec, "Specificity": spec,
            f"F{int(beta)}": fb,
        })

    df = pd.DataFrame(rows)

    return df

# %% 9. MAIN (5-fold CV + save final model)
def main():
    cfg = CONFIG
    cfg["excel_path"] = str(DATA_PATH)   # always use the file found above

    # Load data and features
    X, y, all_features, df_raw = load_data(cfg)

    skf = StratifiedKFold(n_splits=cfg["n_splits"],
                           shuffle=cfg["shuffle"],
                           random_state=cfg["random_state"])

    # Store out-of-fold predictions
    n        = len(y)
    oof_p    = np.full(n, np.nan, dtype=float)
    oof_pred = np.full(n, -1,     dtype=int)
    oof_conf = np.full(n, np.nan, dtype=float)

    fold_results = []
    for fold_idx, (tr_idx, val_idx) in enumerate(skf.split(X, y), start=1):
        res = run_fold(fold_idx,
                        X[tr_idx], y[tr_idx],
                        X[val_idx], y[val_idx], cfg)

        oof_p[val_idx]    = res["p_risk"]
        oof_pred[val_idx] = res["y_pred"]
        oof_conf[val_idx] = res["confidence"]
        fold_results.append(res)

    stats = report_folds(fold_results)
    report_length_scales(fold_results, all_features, cfg)
    quantify_confidence(oof_p, oof_conf)
    pooled = summarize_oof_results(y, oof_pred, oof_p, oof_conf, stats)
    report_auc_confidence(y, oof_p, cfg)
    threshold_sweep(y, oof_p, cfg)

    for key in METRIC_KEYS:
        print(key, round(stats[key]["Mean"], 4))

    # ---------------------------------------------------------
    # FINAL MODEL: fit once on the full internal cohort and save
    # This is separate from the 5-fold CV models above.
    # ---------------------------------------------------------
    final_scaler = StandardScaler()
    X_full_scaled = final_scaler.fit_transform(X)

    X_final_sub, y_final_sub = make_gpc_subset(
        X_full_scaled, y, cfg, fold_idx=999
    )
    final_gpc = fit_gpc(X_final_sub, y_final_sub, cfg)

    artifact = {
        "model": final_gpc,
        "scaler": final_scaler,
        "feature_columns": all_features,
        "threshold": cfg["threshold"],
        "positive_class": cfg["positive_class"],
        "config": cfg,
        "training_rows": int(len(y)),
    }

    model_dir = BASE_DIR / "saved_models"
    model_dir.mkdir(parents=True, exist_ok=True)
    model_path = model_dir / "internal_model.joblib"
    joblib.dump(artifact, model_path)
    print("Saved final internal model ->", model_path)


if __name__ == "__main__":
    main()
