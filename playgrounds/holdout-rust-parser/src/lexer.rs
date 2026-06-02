//! Lexer: turns an expression string into a flat list of tokens.

use crate::token::Token;

/// Error returned when the input contains a character the lexer cannot handle.
#[derive(Debug, Clone, PartialEq)]
pub struct LexError {
    pub message: String,
    pub position: usize,
}

/// Tokenizes an arithmetic expression string into a vector of tokens.
///
/// Whitespace is skipped. Numbers may contain a single decimal point.
pub fn tokenize(input: &str) -> Result<Vec<Token>, LexError> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }

        if c.is_ascii_digit() || c == '.' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            let slice: String = chars[start..i].iter().collect();
            let value = slice.parse::<f64>().map_err(|_| LexError {
                message: format!("invalid number literal '{}'", slice),
                position: start,
            })?;
            tokens.push(Token::Number(value));
            continue;
        }

        match Token::from_operator_char(c) {
            Some(tok) => tokens.push(tok),
            None => {
                return Err(LexError {
                    message: format!("unexpected character '{}'", c),
                    position: i,
                })
            }
        }
        i += 1;
    }

    Ok(tokens)
}
