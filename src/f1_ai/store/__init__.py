"""Storage layer: Parquet file writer and DuckDB view reader."""
from f1_ai.store.parquet_store import write_table
from f1_ai.store.duck import TABLES, connect

__all__ = ["write_table", "TABLES", "connect"]
