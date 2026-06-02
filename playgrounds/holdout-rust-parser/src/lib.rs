//! exprengine: a tiny arithmetic expression engine.
//!
//! The pipeline runs `lexer` -> `parser` -> `evaluator`. The [`evaluate`]
//! convenience function ties all three stages together for callers that just
//! want a number out of a string.

pub mod evaluator;
pub mod lexer;
pub mod parser;
pub mod token;

use crate::evaluator::EvalError;

/// Lexes, parses, and evaluates an arithmetic expression in one call.
///
/// ```
/// assert_eq!(exprengine::evaluate("2 + 3 * 4").unwrap(), 14.0);
/// ```
pub fn evaluate(input: &str) -> Result<f64, EvalError> {
    evaluator::eval_str(input)
}
