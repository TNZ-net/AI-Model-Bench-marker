from typing import Any, TypedDict
import traceback
import httpx
import os
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END

app = FastAPI(title="ModelBench AI Workflow")
# # LangChain connects to your existing local Ollama model.
# model = ChatOllama(
#     model="qwen2.5:1.5b",
#     temperature=0,
#     base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
# )

class RunRequest(BaseModel):
    input: str
    rules: list[dict[str, Any]]
    model_name: str = "qwen2.5:1.5b"

async def get_embedding(client: httpx.AsyncClient, text: str) -> list[float]:
    """Convert text into a numerical embedding using Ollama."""

    response = await client.post(
        f"{os.getenv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434')}/api/embeddings",
        json={
            "model": "nomic-embed-text",
            "prompt": text,
        },
    )

    response.raise_for_status()
    return response.json()["embedding"]

# Shared information passed between LangGraph steps.
class WorkflowState(TypedDict):
    input: str
    rules: list[dict[str, Any]]
    model_name: str
    response: str
    evaluation: dict[str, Any]
    retry_count: int

    # Performance metrics accumulated across attempts.
    generation_latency_ms: float
    prompt_tokens: int | None
    completion_tokens: int | None


async def generate_response(state: WorkflowState):
    """Generate an answer and capture real model performance metrics."""

    retry_note = ""
    if state["retry_count"] > 0:
        retry_note = (
            f"\nYour previous answer was: {state['response']}"
            "\nIt failed these checks: "
            f"{state['evaluation']}"
            "\nCorrect your answer. Follow the requested format exactly."
        )

    # Measure how long this generation attempt takes.
    start_time = time.perf_counter()

    # Select the requested Ollama model for this evaluation.
    model = ChatOllama(
        model=state["model_name"],
        temperature=0,
        base_url=os.getenv(
            "OLLAMA_BASE_URL",
            "http://127.0.0.1:11434"
        )
    )

    result = await model.ainvoke([
        SystemMessage(
            content=(
                "You are an AI model being tested by ModelBench. "
                "Answer the user's task directly and follow any required "
                "output format. Do not add unnecessary explanations."
            )
        ),
        HumanMessage(content=f"Task: {state['input']}{retry_note}"),
    ])

    elapsed_ms = (time.perf_counter() - start_time) * 1000

    # LangChain may expose token usage in either of these locations.
    usage = getattr(result, "usage_metadata", None) or {}
    metadata = getattr(result, "response_metadata", None) or {}

    prompt_tokens = usage.get(
        "input_tokens",
        metadata.get("prompt_eval_count"),
    )

    completion_tokens = usage.get(
        "output_tokens",
        metadata.get("eval_count"),
    )

    # Preserve previous-attempt metrics if LangGraph retries.
    previous_prompt = state.get("prompt_tokens")
    previous_completion = state.get("completion_tokens")

    return {
        "response": str(result.content).strip(),

        # Total generation time across attempts.
        "generation_latency_ms": (
            state.get("generation_latency_ms", 0.0) + elapsed_ms
        ),

        # Keep token counts unknown if Ollama didn't provide them.
        "prompt_tokens": (
            (previous_prompt or 0) + int(prompt_tokens)
            if prompt_tokens is not None
            else previous_prompt
        ),

        "completion_tokens": (
            (previous_completion or 0) + int(completion_tokens)
            if completion_tokens is not None
            else previous_completion
        ),
    }

async def evaluate_response(state: WorkflowState):
    """Generate embeddings and ask C# to run Rust evaluation."""

    try:
        # Find the semantic similarity rule supplied by React.
        semantic_rule = next(
            (
                rule for rule in state["rules"]
                if rule.get("type") == "semantic_similarity"
            ),
            None,
        )

        # Keep ordinary Rust rules separate from semantic comparison.
        regular_rules = [
            rule for rule in state["rules"]
            if rule.get("type") != "semantic_similarity"
        ]

        async with httpx.AsyncClient(timeout=60) as client:

            semantic_data = None

            if semantic_rule:
                expected = semantic_rule.get("expected", "").strip()
                threshold = float(semantic_rule.get("threshold", 0.80))

                if not expected:
                    raise ValueError(
                        "Semantic similarity requires an expected answer."
                    )

                if not 0.0 <= threshold <= 1.0:
                    raise ValueError(
                        "Similarity threshold must be between 0 and 1."
                    )

                # Convert both answers into numerical vectors.
                expected_embedding = await get_embedding(client, expected)
                actual_embedding = await get_embedding(
                    client, state["response"]
                )

                semantic_data = {
                    "expected_embedding": expected_embedding,
                    "actual_embedding": actual_embedding,
                    "threshold": threshold,
                }

            # Send the vectors to C#; C# forwards them to Rust.
            payload = {
                "actual": state["response"],
                "rules": regular_rules,
            }

            if semantic_data is not None:
                payload["semantic_similarity"] = semantic_data

            result = await client.post(
                f"{os.getenv('EVALUATION_API_URL', 'http://127.0.0.1:5080')}/api/Evaluations",
                json=payload,
            )

            result.raise_for_status()

        return {"evaluation": result.json()}

    except httpx.HTTPError as error:
        raise RuntimeError(
            f"Could not reach Ollama or the C# evaluation API: {error}"
        ) from error


def choose_next_step(state: WorkflowState):
    """Retry once if evaluation fails; never loop indefinitely."""

    if (
        not state["evaluation"].get("passed", False)
        and state["retry_count"] < 1
    ):
        return "retry"

    return END


def prepare_retry(state: WorkflowState):
    return {"retry_count": state["retry_count"] + 1}


# Build the workflow graph.
graph = StateGraph(WorkflowState)

graph.add_node("generate", generate_response)
graph.add_node("evaluate", evaluate_response)
graph.add_node("prepare_retry", prepare_retry)

graph.set_entry_point("generate")
graph.add_edge("generate", "evaluate")

graph.add_conditional_edges(
    "evaluate",
    choose_next_step,
    {
        "retry": "prepare_retry",
        END: END,
    },
)

graph.add_edge("prepare_retry", "generate")

workflow = graph.compile()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/run")
async def run_workflow(request: RunRequest):

    # 1. Check that input is not empty.
    if not request.input.strip():
        raise HTTPException(
            status_code=400,
            detail="Input is required."
        )

    # 2. Only allow our two approved benchmark models.
    allowed_models = {
        "qwen2.5:1.5b",
        "qwen2.5:0.5b",
    }

    if request.model_name not in allowed_models:
        raise HTTPException(
            status_code=400,
            detail="Unsupported model."
        )

    # 3. Run the workflow.
    try:
        result = await workflow.ainvoke({
            "input": request.input,
            "rules": request.rules,
            "model_name": request.model_name,
            "response": "",
            "evaluation": {},
            "retry_count": 0,

            "generation_latency_ms": 0.0,
            "prompt_tokens": None,
            "completion_tokens": None,
        })

        return {
            "modelResponse": result["response"],
            "evaluation": result["evaluation"],
            "retryCount": result["retry_count"],

            "generationLatencyMs": round(
                result["generation_latency_ms"], 2
            ),
            "promptTokens": result["prompt_tokens"],
            "completionTokens": result["completion_tokens"],
        }

    except Exception as error:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"{type(error).__name__}: {error}"
        ) from error
