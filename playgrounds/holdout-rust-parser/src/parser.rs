//! Parser: builds an AST from a token stream using precedence climbing.

use crate::lexer;
use crate::token::Token;

/// Abstract syntax tree node for an arithmetic expression.
#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    Number(f64),
    BinaryOp {
        op: Token,
        left: Box<Expr>,
        right: Box<Expr>,
    },
}

/// Error returned when the token stream does not form a valid expression.
#[derive(Debug, Clone, PartialEq)]
pub struct ParseError {
    pub message: String,
}

/// Parses a raw expression string into an AST by lexing then parsing.
pub fn parse(input: &str) -> Result<Expr, ParseError> {
    let tokens = lexer::tokenize(input).map_err(|e| ParseError {
        message: format!("lex error at {}: {}", e.position, e.message),
    })?;
    let mut pos = 0;
    let expr = parse_expr(&tokens, &mut pos, 0)?;
    if pos != tokens.len() {
        return Err(ParseError {
            message: "trailing tokens after expression".into(),
        });
    }
    Ok(expr)
}

fn parse_expr(tokens: &[Token], pos: &mut usize, min_bp: u8) -> Result<Expr, ParseError> {
    let mut left = parse_atom(tokens, pos)?;
    while let Some(op) = tokens.get(*pos) {
        if !op.is_operator() || op.precedence() < min_bp {
            break;
        }
        let op = op.clone();
        *pos += 1;
        let right = parse_expr(tokens, pos, op.precedence() + 1)?;
        left = Expr::BinaryOp {
            op,
            left: Box::new(left),
            right: Box::new(right),
        };
    }
    Ok(left)
}

fn parse_atom(tokens: &[Token], pos: &mut usize, ) -> Result<Expr, ParseError> {
    match tokens.get(*pos) {
        Some(Token::Number(n)) => {
            *pos += 1;
            Ok(Expr::Number(*n))
        }
        Some(Token::LParen) => {
            *pos += 1;
            let inner = parse_expr(tokens, pos, 0)?;
            match tokens.get(*pos) {
                Some(Token::RParen) => {
                    *pos += 1;
                    Ok(inner)
                }
                _ => Err(ParseError { message: "expected ')'".into() }),
            }
        }
        other => Err(ParseError {
            message: format!("expected number or '(', found {:?}", other),
        }),
    }
}
