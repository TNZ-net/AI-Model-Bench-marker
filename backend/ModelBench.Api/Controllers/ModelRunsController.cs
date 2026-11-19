using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using ModelBench.Api.Data;
using ModelBench.Api.Models;
using ModelBench.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace ModelBench.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ModelRunsController : ControllerBase
{
    // private readonly IModelProvider _provider;
    // private readonly RustEvaluatorService _evaluator;
    
    private readonly ModelBenchDbContext _db;
    private readonly PythonWorkflowService _pythonWorkflow;

    public ModelRunsController(
    PythonWorkflowService pythonWorkflow,
    ModelBenchDbContext db)
    {
        _pythonWorkflow = pythonWorkflow;
        _db = db;
    }

    public record RunRequest(
        string Input,
        JsonElement Rules,
        string ModelName = "qwen2.5:1.5b"
    );
    
    [HttpPost]
    public async Task<IActionResult> Run([FromBody] RunRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Input))
            return BadRequest("Input is required.");

        if (request.Rules.ValueKind != JsonValueKind.Array)
            return BadRequest("Rules must be a JSON array.");

        var allowedModels = new[]
        {
            "qwen2.5:1.5b",
            "qwen2.5:0.5b"
        };

        if (!allowedModels.Contains(request.ModelName))
            return BadRequest("Unsupported model.");

        var result = await _pythonWorkflow.RunAsync(
            request.Input,
            request.Rules,
            request.ModelName
        );

        var passed = result.Evaluation
            .GetProperty("passed")
            .GetBoolean();

        double? similarity = null;

        if (result.Evaluation.TryGetProperty(
            "semantic_similarity", out var similarityElement)
            && similarityElement.ValueKind == JsonValueKind.Number)
        {
            similarity = similarityElement.GetDouble();
        }

        var savedRun = new EvaluationRun
        {
            Input = request.Input,
            ModelName = request.ModelName,
            ModelResponse = result.ModelResponse,
            Passed = passed,
            CreatedAt = DateTime.UtcNow,

            SemanticSimilarity = similarity,
            GenerationLatencyMs = result.GenerationLatencyMs,
            PromptTokens = result.PromptTokens,
            CompletionTokens = result.CompletionTokens,
            RetryCount = result.RetryCount
        };

        _db.EvaluationRuns.Add(savedRun);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            id = savedRun.Id,
            modelResponse = result.ModelResponse,
            evaluation = result.Evaluation,
            retryCount = result.RetryCount
        });
    }


    
    
    // Retrieve a page of evaluation history.
    [HttpGet]
    public async Task<IActionResult> GetHistory(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        if (page < 1 || pageSize < 1 || pageSize > 100)
            return BadRequest(
                "Page must be positive; pageSize must be between 1 and 100.");

        var query = _db.EvaluationRuns
            .OrderByDescending(run => run.CreatedAt);

        var total = await query.CountAsync();

        var runs = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new
        {
            page,
            pageSize,
            total,
            runs
        });
    }


    
    // Return summary statistics for the dashboard.
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var total = await _db.EvaluationRuns.CountAsync();

        var passed = await _db.EvaluationRuns
            .CountAsync(run => run.Passed);

        var failed = total - passed;

        var passRate = total == 0
            ? 0
            : Math.Round((double)passed / total * 100, 2);

        return Ok(new
        {
            total,
            passed,
            failed,
            passRate
        });
    }

    
    // Filter evaluation history by pass/fail status.
    [HttpGet("filter")]
    public async Task<IActionResult> FilterHistory(
        [FromQuery] bool? passed)
    {
        var query = _db.EvaluationRuns.AsQueryable();

        if (passed.HasValue)
        {
            query = query.Where(
                run => run.Passed == passed.Value);
        }

        var runs = await query
            .OrderByDescending(run => run.CreatedAt)
            .ToListAsync();

        return Ok(runs);
    }


}
