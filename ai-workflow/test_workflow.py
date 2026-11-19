
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import main
from main import choose_next_step, prepare_retry

class WorkflowRetryTests(unittest.TestCase):

    def test_failed_answer_triggers_retry(self):
        state = {
            "evaluation": {"passed": False},
            "retry_count": 0,
        }

        self.assertEqual(choose_next_step(state), "retry")

    def test_retry_increments_counter(self):
        state = {"retry_count": 0}

        result = prepare_retry(state)

        self.assertEqual(result["retry_count"], 1)

    def test_second_failure_stops_workflow(self):
        state = {
            "evaluation": {"passed": False},
            "retry_count": 1,
        }

        self.assertEqual(choose_next_step(state), "__end__")


if __name__ == "__main__":
    unittest.main()


class FullWorkflowRetryTests(unittest.IsolatedAsyncioTestCase):

    async def test_failed_answer_is_retried_and_then_passes(self):
        # Simulate two AI answers: first wrong, then correct.
        class FakeModel:
            def __init__(self):
                self.answers = ["Wrong answer", "Food"]
                self.calls = 0

            async def ainvoke(self, messages):
                answer = self.answers[self.calls]
                self.calls += 1
                return SimpleNamespace(content=answer)

        # Simulate the Rust evaluator's responses via the C# API.
        evaluations = [
            {"passed": False},
            {"passed": True},
        ]

        class FakeResponse:
            def __init__(self, data):
                self.data = data

            def raise_for_status(self):
                pass

            def json(self):
                return self.data

        class FakeClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            async def post(self, url, json):
                return FakeResponse(evaluations.pop(0))

        fake_model = FakeModel()

        with (
            patch.object(main, "ChatOllama", return_value=fake_model),
            patch.object(main.httpx, "AsyncClient", FakeClient),
        ):
            result = await main.workflow.ainvoke({
                "input": "Return the word Food",
                "rules": [],
                "model_name": "qwen2.5:1.5b",
                "response": "",
                "evaluation": {},
                "retry_count": 0,
            })

        self.assertEqual(result["response"], "Food")
        self.assertTrue(result["evaluation"]["passed"])
        self.assertEqual(result["retry_count"], 1)
        self.assertEqual(fake_model.calls, 2)
        self.assertEqual(len(evaluations), 0)
