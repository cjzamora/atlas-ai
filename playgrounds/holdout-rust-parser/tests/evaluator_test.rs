use exprengine::evaluator::eval_str;

#[test]
fn evaluates_precedence_correctly() {
    assert_eq!(eval_str("2 + 3 * 4").unwrap(), 14.0);
}

#[test]
fn evaluates_with_parentheses() {
    assert_eq!(eval_str("(2 + 3) * 4").unwrap(), 20.0);
}

#[test]
fn evaluates_division() {
    assert_eq!(eval_str("10 / 4").unwrap(), 2.5);
}

#[test]
fn reports_division_by_zero() {
    let err = eval_str("1 / 0").unwrap_err();
    assert!(err.message.contains("division by zero"));
}

#[test]
fn top_level_evaluate_matches() {
    assert_eq!(exprengine::evaluate("1 + 1").unwrap(), 2.0);
}
