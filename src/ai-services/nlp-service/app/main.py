from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from typing import Optional

from app.services.gold_nlp import analyse_gold_news, is_spam_or_irrelevant

app = FastAPI(title="Gold NLP Intelligence Service", version="1.0.0")
app.add_middleware(GZipMiddleware, minimum_size=300)


class AnalyseRequest(BaseModel):
    id: str
    headline: str
    body: Optional[str] = None


class AnalyseResponse(BaseModel):
    id: str
    sentiment: str
    sentiment_score: float
    impact: str
    market_impact_score: float
    affected_instruments: list[str]
    macro_themes: list[str]
    filtered: bool = False
    filter_reason: Optional[str] = None


@app.post("/analyze", response_model=AnalyseResponse)
def analyze(req: AnalyseRequest) -> AnalyseResponse:
    filtered, reason = is_spam_or_irrelevant(req.headline)
    if filtered:
        return AnalyseResponse(
            id=req.id,
            sentiment="Neutral", sentiment_score=0,
            impact="None", market_impact_score=0,
            affected_instruments=[], macro_themes=[],
            filtered=True, filter_reason=reason,
        )

    result = analyse_gold_news(req.headline, req.body)
    return AnalyseResponse(
        id=req.id,
        sentiment=result.sentiment,
        sentiment_score=result.sentiment_score,
        impact=result.impact,
        market_impact_score=result.market_impact_score,
        affected_instruments=result.affected_instruments,
        macro_themes=result.macro_themes,
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "nlp-service"}
