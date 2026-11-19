using Microsoft.AspNetCore.Mvc;
using ModelBench.Api.Services;

namespace ModelBench.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ModelsController : ControllerBase
{
    private readonly IModelProvider _provider;

    public ModelsController(IModelProvider provider)
    {
        _provider = provider;
    }

    public record GenerateRequest(string Input);

    [HttpPost("generate")]
    public async Task<IActionResult> Generate(
        [FromBody] GenerateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Input))
            return BadRequest("Input is required.");

        var response = await _provider.GenerateAsync(request.Input);

        return Ok(new { response });
    }
}
