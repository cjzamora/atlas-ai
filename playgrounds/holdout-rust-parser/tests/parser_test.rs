use exprengine::parser::{parse, Expr};
use exprengine::token::Token;

#[test]
fn parses_single_number() {
    assert_eq!(parse("42").unwrap(), Expr::Number(42.0));
}

#[test]
fn respects_operator_precedence() {
    // 1 + 2 * 3 should parse as 1 + (2 * 3)
    let ast = parse("1 + 2 * 3").unwrap();
    match ast {
        Expr::BinaryOp { op, left, right } => {
            assert_eq!(op, Token::Plus);
            assert_eq!(*left, Expr::Number(1.0));
            assert!(matches!(*right, Expr::BinaryOp { op: Token::Star, .. }));
        }
        other => panic!("expected binary op, got {:?}", other),
    }
}

#[test]
fn parentheses_override_precedence() {
    let ast = parse("(1 + 2) * 3").unwrap();
    assert!(matches!(ast, Expr::BinaryOp { op: Token::Star, .. }));
}

#[test]
fn rejects_trailing_tokens() {
    assert!(parse("1 2").is_err());
    assert!(parse("(1").is_err());
}
