//! Library facade — exposes modules for ts-rs type generation and testing.

/// Compile-time embedded app manifest, used by the db module to read the schema name.
pub(crate) const MANIFEST: &str = include_str!("../tokimo-app.toml");

pub mod ctx;
pub mod db;
pub mod error;
pub mod handlers;
pub mod repos;
pub mod services;
