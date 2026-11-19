namespace ModelBench.Api.Services;

public class MockModelProvider : IModelProvider
{
    public Task<string> GenerateAsync(string input)
    {
        // Predictable mock response for testing.
        var response = input.ToLowerInvariant() switch
        {
            var text when text.Contains("lunch") ||
                          text.Contains("food") => "Food",

            var text when text.Contains("bus") ||
                          text.Contains("train") ||
                          text.Contains("taxi") => "Transport",

            _ => "Other"
        };

        return Task.FromResult(response);
    }
}
