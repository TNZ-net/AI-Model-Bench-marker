using System.Net.Http.Json;

namespace ModelBench.Api.Services;

public class OllamaModelProvider : IModelProvider
{
    private readonly HttpClient _http;

    public OllamaModelProvider(HttpClient http)
    {
        _http = http;
    }

    public async Task<string> GenerateAsync(string input)
    {
        var response = await _http.PostAsJsonAsync(
            "/api/generate",
            new
            {
                model = "qwen2.5:1.5b",
                prompt = $"Classify this expense into Food, Transport, Shopping, Bills, or Other. Reply with only the category.\nExpense: {input}",
                stream = false
            });

        response.EnsureSuccessStatusCode();

        var result = await response.Content
            .ReadFromJsonAsync<OllamaResponse>();

        return result?.Response?.Trim()
            ?? throw new InvalidOperationException(
                "Ollama returned an empty response.");
    }

    private record OllamaResponse(string Response);
}
