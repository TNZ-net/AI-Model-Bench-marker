namespace ModelBench.Api.Services;
public interface IModelProvider
{
    Task<string> GenerateAsync(string input);
}
