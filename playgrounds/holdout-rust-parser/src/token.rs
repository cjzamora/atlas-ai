//! Token definitions shared between the lexer and the parser.

/// A single lexical token produced from an expression string.
#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    Number(f64),
    Plus,
    Minus,
    Star,
    Slash,
    LParen,
    RParen,
}

impl Token {
    /// Returns `true` when the token is a binary arithmetic operator.
    pub fn is_operator(&self) -> bool {
        matches!(self, Token::Plus | Token::Minus | Token::Star | Token::Slash)
    }

    /// Operator binding power; higher binds tighter. Non-operators yield 0.
    pub fn precedence(&self) -> u8 {
        match self {
            Token::Plus | Token::Minus => 1,
            Token::Star | Token::Slash => 2,
            _ => 0,
        }
    }

    /// Maps a single operator character to its token, if recognized.
    pub fn from_operator_char(c: char) -> Option<Token> {
        match c {
            '+' => Some(Token::Plus),
            '-' => Some(Token::Minus),
            '*' => Some(Token::Star),
            '/' => Some(Token::Slash),
            '(' => Some(Token::LParen),
            ')' => Some(Token::RParen),
            _ => None,
        }
    }
}
