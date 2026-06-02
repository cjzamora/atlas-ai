use exprengine::token::Token;

#[test]
fn plus_and_star_are_operators() {
    assert!(Token::Plus.is_operator());
    assert!(Token::Star.is_operator());
}

#[test]
fn parens_and_numbers_are_not_operators() {
    assert!(!Token::LParen.is_operator());
    assert!(!Token::Number(1.0).is_operator());
}

#[test]
fn multiplication_binds_tighter_than_addition() {
    assert!(Token::Star.precedence() > Token::Plus.precedence());
    assert_eq!(Token::Number(2.0).precedence(), 0);
}

#[test]
fn operator_chars_map_to_tokens() {
    assert_eq!(Token::from_operator_char('+'), Some(Token::Plus));
    assert_eq!(Token::from_operator_char('/'), Some(Token::Slash));
    assert_eq!(Token::from_operator_char('x'), None);
}
