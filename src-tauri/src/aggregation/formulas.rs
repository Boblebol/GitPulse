use evalexpr::{eval_number_with_context, ContextWithMutableVariables, HashMapContext, Value};
use thiserror::Error;

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum FormulaError {
    #[error("formula evaluation error: {0}")]
    Eval(#[from] evalexpr::EvalexprError),
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Evaluate the player-score formula for one `stats_daily_developer` row.
///
/// Variables injected into the expression:
/// - `commits`, `insertions`, `deletions`, `files_touched` — raw daily stats
/// - `streak_bonus` — `1` when `streak >= 3`, else `0`
pub fn evaluate_raw_score(
    formula: &str,
    commits: i64,
    insertions: i64,
    deletions: i64,
    files_touched: i64,
    streak: i64,
) -> Result<f64, FormulaError> {
    let mut ctx = HashMapContext::new();
    ctx.set_value("commits".to_string(), Value::Int(commits))?;
    ctx.set_value("insertions".to_string(), Value::Int(insertions))?;
    ctx.set_value("deletions".to_string(), Value::Int(deletions))?;
    ctx.set_value("files_touched".to_string(), Value::Int(files_touched))?;
    ctx.set_value(
        "streak_bonus".to_string(),
        Value::Int(if streak >= 3 { 1 } else { 0 }),
    )?;

    Ok(eval_number_with_context(formula, &ctx)?)
}

/// Convert a list of `(row_id, raw_score)` pairs (for a **single** developer)
/// into `(row_id, percentile_0_to_100)` pairs.
///
/// Percentile = (count of scores ≤ this score) / total × 100
pub fn percentile_scores(raw: &[(String, f64)]) -> Vec<(String, f64)> {
    if raw.is_empty() {
        return vec![];
    }
    let n = raw.len() as f64;
    raw.iter()
        .map(|(id, score)| {
            let rank = raw.iter().filter(|(_, s)| *s <= *score).count() as f64;
            (id.clone(), (rank / n) * 100.0)
        })
        .collect()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const FORMULA: &str =
        "(commits * 10) + (insertions * 0.5) - (deletions * 0.3) + (files_touched * 2) + (streak_bonus * 3)";

    // ── evaluate_raw_score ────────────────────────────────────────────────────

    #[test]
    fn known_values_no_streak() {
        // commits=2, ins=10, del=4, files=3, streak=1
        // raw = 20 + 5 - 1.2 + 6 + 0 = 29.8
        let score = evaluate_raw_score(FORMULA, 2, 10, 4, 3, 1).unwrap();
        assert!((score - 29.8).abs() < 1e-9, "got {score}");
    }

    #[test]
    fn streak_bonus_not_applied_below_3() {
        let without = evaluate_raw_score(FORMULA, 1, 0, 0, 0, 2).unwrap();
        // streak_bonus = 0, raw = 10
        assert!((without - 10.0).abs() < 1e-9, "got {without}");
    }

    #[test]
    fn streak_bonus_applied_at_3() {
        let with_bonus = evaluate_raw_score(FORMULA, 1, 0, 0, 0, 3).unwrap();
        // streak_bonus = 1, raw = 10 + 3 = 13
        assert!((with_bonus - 13.0).abs() < 1e-9, "got {with_bonus}");
    }

    #[test]
    fn streak_bonus_applied_above_3() {
        let high = evaluate_raw_score(FORMULA, 1, 0, 0, 0, 10).unwrap();
        assert!((high - 13.0).abs() < 1e-9, "streak_bonus caps at 1");
    }

    #[test]
    fn invalid_formula_returns_error() {
        let result = evaluate_raw_score("commits + !!!", 1, 0, 0, 0, 0);
        assert!(result.is_err());
    }

    // ── percentile_scores ─────────────────────────────────────────────────────

    #[test]
    fn percentile_empty_slice() {
        assert!(percentile_scores(&[]).is_empty());
    }

    #[test]
    fn percentile_single_value_is_100() {
        let result = percentile_scores(&[("a".into(), 42.0)]);
        assert_eq!(result.len(), 1);
        assert!((result[0].1 - 100.0).abs() < 1e-9);
    }

    #[test]
    fn percentile_ordering_is_correct() {
        // scores: 10, 20, 30 → percentiles: 33.3, 66.6, 100
        let raw = vec![
            ("a".to_string(), 10.0),
            ("b".to_string(), 20.0),
            ("c".to_string(), 30.0),
        ];
        let pct: std::collections::HashMap<_, _> = percentile_scores(&raw).into_iter().collect();

        assert!((pct["a"] - 100.0 / 3.0).abs() < 1e-6, "a={}", pct["a"]);
        assert!((pct["b"] - 200.0 / 3.0).abs() < 1e-6, "b={}", pct["b"]);
        assert!((pct["c"] - 100.0).abs() < 1e-6, "c={}", pct["c"]);
    }

    #[test]
    fn percentile_ties_share_same_percentile() {
        let raw = vec![
            ("a".to_string(), 10.0),
            ("b".to_string(), 10.0),
            ("c".to_string(), 20.0),
        ];
        let pct: std::collections::HashMap<_, _> = percentile_scores(&raw).into_iter().collect();

        // Both a and b have rank 2 (2 scores ≤ 10), so percentile = 2/3 * 100
        assert!((pct["a"] - pct["b"]).abs() < 1e-9, "ties must be equal");
        assert!(pct["c"] > pct["a"]);
    }
}
