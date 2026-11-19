using Microsoft.EntityFrameworkCore;
using ModelBench.Api.Data;
using ModelBench.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

builder.Services.AddDbContext<ModelBenchDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("ModelBench")));
builder.Services.AddScoped<RustEvaluatorService>();

var ollamaUrl = builder.Configuration["OLLAMA_BASE_URL"]
    ?? "http://localhost:11434";

var pythonUrl = builder.Configuration["PYTHON_WORKFLOW_URL"]
    ?? "http://127.0.0.1:8000";

builder.Services.AddHttpClient<IModelProvider, OllamaModelProvider>(
    client =>
    {
        client.BaseAddress = new Uri(ollamaUrl);
        client.Timeout = TimeSpan.FromMinutes(2);
    });

builder.Services.AddHttpClient<PythonWorkflowService>(client =>
{
    client.BaseAddress = new Uri(pythonUrl);
    client.Timeout = TimeSpan.FromMinutes(3);
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod());
});

var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider
        .GetRequiredService<ModelBenchDbContext>();

    db.Database.Migrate();
}

app.UseCors("Frontend");

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();
app.Run();