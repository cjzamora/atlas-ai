//! Evaluator: walks an AST and reduces it to a single numeric value.

use crate::parser::{self, Expr};
use crate::token::Token;

/// Error returned when an AST cannot be evaluated (e.g. division by zero).
#[derive(Debug, Clone, PartialEq)]
pub struct EvalError {
    pub message: String,
}

/// Parses and evaluates an expression string, returning its numeric result.
pub fn eval_str(input: &str) -> Result<f64, EvalError> {
    let ast = parser::parse(input).map_err(|e| EvalError {
        message: format!("parse error: {}", e.message),
    })?;
    eval(&ast)
}

/// Recursively evaluates an AST node to a floating point number.
pub fn eval(expr: &Expr) -> Result<f64, EvalError> {
    match expr {
        Expr::Number(n) => Ok(*n),
        Expr::BinaryOp { op, left, right } => {
            let l = eval(left)?;
            let r = eval(right)?;
            match op {
                Token::Plus => Ok(l + r),
                Token::Minus => Ok(l - r),
                Token::Star => Ok(l * r),
                Token::Slash => {
                    if r == 0.0 {
                        Err(EvalError {
                            message: "division by zero".into(),
                        })
                    } else {
                        Ok(l / r)
                    }
                }
                other => Err(EvalError {
                    message: format!("not a binary operator: {:?}", other),
                }),
            }
        }
    }
}
