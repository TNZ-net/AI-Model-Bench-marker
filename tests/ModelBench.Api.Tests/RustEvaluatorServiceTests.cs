using ModelBench.Api.Services;
using Xunit;

namespace ModelBench.Api.Tests;
public class RustEvaluatorServiceTests
{
    [Fact]
    public async Task EvaluateAsync_ExactMatch_ReturnsPassedResult()
    {
        //Arrange: create the real service.
        var service = new RustEvaluatorService();

        var requestJson = """
        {
            "actual": "Food",
            "rules": [
                {
                    "type": "exact_match",
                    "expected": "Food"
                }
            ]
        }
        """;

        // Act: launch Rust and receive its JSON result.
        var result = await service.EvaluateAsync(requestJson);

        // Assert: check that Rust reports success.
        Assert.Contains("\"passed\":true", result);
    }

    
    [Fact]
    public async Task EvaluateAsync_WrongAnswer_ReturnsFailedResult()
    {
        var service = new RustEvaluatorService();

        var requestJson = """
        {
            "actual": "Transport",
            "rules": [
                {
                    "type": "exact_match",
                    "expected": "Food"
                }
            ]
        }
        """;
        var result = await service.EvaluateAsync(requestJson);
        Assert.Contains("\"passed\":false", result);
    }

}
