use exprengine::lexer::tokenize;
use exprengine::token::Token;

#[test]
fn tokenizes_simple_addition() {
    let tokens = tokenize("1 + 2").unwrap();
    assert_eq!(
        tokens,
        vec![Token::Number(1.0), Token::Plus, Token::Number(2.0)]
    );
}

#[test]
fn skips_whitespace_and_reads_decimals() {
    let tokens = tokenize("  3.5  *  10 ").unwrap();
    assert_eq!(
        tokens,
        vec![Token::Number(3.5), Token::Star, Token::Number(10.0)]
    );
}

#[test]
fn tokenizes_parentheses() {
    let tokens = tokenize("(1)").unwrap();
    assert_eq!(tokens, vec![Token::LParen, Token::Number(1.0), Token::RParen]);
}

#[test]
fn rejects_unexpected_character() {
    let err = tokenize("1 $ 2").unwrap_err();
    assert_eq!(err.position, 2);
    assert!(err.message.contains("unexpected character"));
}
