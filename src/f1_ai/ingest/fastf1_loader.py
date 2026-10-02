"""FastF1 data loader: sessions, laps, weather, and metadata."""
import fastf1
import pandas as pd

from f1_ai.config import CACHE_DIR, PIPELINE_VERSION

CACHE_DIR.mkdir(parents=True, exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE_DIR))


def session_id_for(year: int, round_number: int, kind: str) -> str:
    """Format standard session identifier (e.g. '2026_16_FP2')."""
    return f"{year}_{round_number:02d}_{kind.upper()}"


def load_session(year: int, event: int | str, kind: str):
    """Load a session with laps, telemetry, weather, and race control messages."""
    s = fastf1.get_session(year, event, kind)
    s.load(laps=True, telemetry=True, weather=True, messages=True)
    return s


def metadata_table(s, sid: str) -> pd.DataFrame:
    """Extract session metadata row for session_metadata table."""
    year = int(getattr(s.event, "Year", 0) or sid.split("_")[0])
    round_no = int(getattr(s.event, "RoundNumber", 0) or sid.split("_")[1])
    return pd.DataFrame([{
        "session_id": sid,
        "year": year,
        "round": round_no,
        "event_name": str(getattr(s.event, "EventName", "")),
        "location": str(getattr(s.event, "Location", "")),
        "session_type": str(getattr(s, "name", sid.split("_")[2])),
        "session_date": str(getattr(s, "date", "")),
        "fastf1_version": str(fastf1.__version__),
        "pipeline_version": PIPELINE_VERSION,
        "ingested_at": pd.Timestamp.utcnow().isoformat(),
    }])


def laps_table(s, sid: str) -> pd.DataFrame:
    """Map FastF1 laps and weather into the standard laps schema."""
    laps = s.laps
    weather = laps.get_weather_data().reset_index(drop=True)
    df = pd.DataFrame({
        "session_id": sid,
        "driver": laps["Driver"].to_numpy(),
        "team": laps["Team"].to_numpy(),
        "lap_number": laps["LapNumber"].astype("Int64").to_numpy(),
        "stint": laps["Stint"].astype("Int64").to_numpy(),
        "compound": laps["Compound"].to_numpy(),
        "tyre_life": laps["TyreLife"].to_numpy(),
        "fresh_tyre": laps["FreshTyre"].to_numpy(),
        "lap_time_s": laps["LapTime"].dt.total_seconds().to_numpy(),
        "speed_trap_kmh": laps["SpeedST"].to_numpy(),
        "track_status": laps["TrackStatus"].astype(str).to_numpy(),
        "is_accurate": laps["IsAccurate"].fillna(False).astype(bool).to_numpy(),
        "deleted": laps["Deleted"].fillna(False).astype(bool).to_numpy(),
        "pit_out": laps["PitOutTime"].notna().to_numpy(),
        "pit_in": laps["PitInTime"].notna().to_numpy(),
        "track_temp_c": weather["TrackTemp"].to_numpy(),
        "air_temp_c": weather["AirTemp"].to_numpy(),
        "rainfall": weather["Rainfall"].to_numpy(),
    })
    for i in (1, 2, 3):
        df[f"s{i}_s"] = laps[f"Sector{i}Time"].dt.total_seconds().to_numpy()
    return df
