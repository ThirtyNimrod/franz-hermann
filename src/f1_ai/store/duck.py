"""In-memory DuckDB connection with one view per table. Never locks the data."""
import duckdb

from f1_ai.config import PARQUET_DIR

TABLES = [
    "session_metadata",
    "laps",
    "tyre_stints",
    "corner_metrics",
    "segment_deltas",
    "energy_signature",
    "session_highlights",
]


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()  # in-memory database
    for table in TABLES:
        folder = PARQUET_DIR / table
        if not any(folder.glob("*/*.parquet")):
            continue
        glob = (folder / "*" / "*.parquet").as_posix()
        con.execute(
            f"CREATE VIEW {table} AS SELECT * FROM read_parquet('{glob}', "
            "hive_partitioning = true, hive_types_autocast = false, union_by_name = true)"
        )
    return con
