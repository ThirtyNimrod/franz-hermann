"""Run the F1 AI Race Engineer FastAPI server."""
import uvicorn

if __name__ == "__main__":
    uvicorn.run("f1_ai.api:app", host="127.0.0.1", port=8000, reload=True)
