using Microsoft.EntityFrameworkCore;
using ModelBench.Api.Models;

namespace ModelBench.Api.Data;

public class ModelBenchDbContext : DbContext
{
    public ModelBenchDbContext(
        DbContextOptions<ModelBenchDbContext> options)
        : base(options) { }

    public DbSet<TestCase> TestCases => Set<TestCase>();

    // PostgreSQL table for saved AI evaluation runs.
    public DbSet<EvaluationRun> EvaluationRuns => Set<EvaluationRun>();
}
