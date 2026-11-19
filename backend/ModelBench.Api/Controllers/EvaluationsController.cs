using Microsoft.AspNetCore.Mvc;
using ModelBench.Api.Services;

namespace ModelBench.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EvaluationsController : ControllerBase
{
    private readonly RustEvaluatorService _evaluator;

    public EvaluationsController(RustEvaluatorService evaluator)
    {
        _evaluator = evaluator;
    }

    [HttpPost]
    public async Task<IActionResult> Evaluate(
        [FromBody] System.Text.Json.JsonElement request)
    {
        try
        {
            var result = await _evaluator.EvaluateAsync(
                request.GetRawText());

            return Content(
                result,
                "application/json",
                System.Text.Encoding.UTF8);
        }
        catch (Exception ex)
        {
            return Problem(
                title: "Evaluation failed",
                detail: ex.Message,
                statusCode: 500);
        }
    }
}
