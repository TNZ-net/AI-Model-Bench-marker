using System.Net.Http.Json;
using System.Text.Json;

namespace ModelBench.Api.Services;

public class PythonWorkflowService
{
    private readonly HttpClient _httpClient;

    public PythonWorkflowService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public record WorkflowResponse(
        string ModelResponse,
        JsonElement Evaluation,
        int RetryCount,
        double? GenerationLatencyMs,
        int? PromptTokens,
        int? CompletionTokens
    );

    public async Task<WorkflowResponse> RunAsync(
        string input,
        JsonElement rules,
        string modelName)
    {
        var response = await _httpClient.PostAsJsonAsync(
            "/run",
            new
            {
                input,
                rules,
                model_name = modelName
            }
        );

        response.EnsureSuccessStatusCode();

        return await response.Content
            .ReadFromJsonAsync<WorkflowResponse>()
            ?? throw new InvalidOperationException(
                "Python workflow returned an empty response."
            );
    }
}
