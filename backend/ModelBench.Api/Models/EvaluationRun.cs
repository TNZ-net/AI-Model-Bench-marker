namespace ModelBench.Api.Models;

public class EvaluationRun
{
    public int Id { get; set; }

    public string Input { get; set; } = string.Empty;

    public string ModelResponse { get; set; } = string.Empty;

    public string ModelName { get; set; } = "qwen2.5:1.5b";

    public bool Passed { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
 
    public double? SemanticSimilarity { get; set; }

    public double? GenerationLatencyMs { get; set; }

    public int? PromptTokens { get; set; }

    public int? CompletionTokens { get; set; }

    public int RetryCount { get; set; }
}