using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ModelBench.Api.Data;
using ModelBench.Api.Models;

namespace ModelBench.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TestCasesController : ControllerBase
{
    private readonly ModelBenchDbContext _db;

    public TestCasesController(ModelBenchDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<TestCase>>> GetAll()
    {
        return await _db.TestCases
            .AsNoTracking()
            .ToListAsync();
    }

    [HttpPost]
    public async Task<ActionResult<TestCase>> Create(TestCase testCase)
    {
        testCase.Id = 0;

        _db.TestCases.Add(testCase);
        await _db.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetAll),
            new { id = testCase.Id },
            testCase);
    }
}
