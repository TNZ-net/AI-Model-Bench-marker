using System.Diagnostics;
using System.Text;

namespace ModelBench.Api.Services;

public class RustEvaluatorService
{
    public async Task<string> EvaluateAsync(string requestJson)
    {
        var projectRoot = FindProjectRoot();

        var executableName = OperatingSystem.IsWindows()
            ? "evaluator.exe"
            : "evaluator";

        var buildFolder = OperatingSystem.IsWindows()
            ? "debug"
            : "release";

        var executable = Path.Combine(
            projectRoot, "evaluator", "target", buildFolder, executableName);

        if (!File.Exists(executable))
            throw new FileNotFoundException(
                "Rust evaluator not found. Run cargo build in the evaluator folder.",
                executable);

        var startInfo = new ProcessStartInfo
        {
            FileName = executable,
            WorkingDirectory = Path.GetDirectoryName(executable)!,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = new Process { StartInfo = startInfo };
        process.Start();

        await process.StandardInput.WriteAsync(requestJson);
        process.StandardInput.Close();

        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();

        await process.WaitForExitAsync();

        var output = await outputTask;
        var error = await errorTask;

        if (process.ExitCode != 0)
            throw new InvalidOperationException(
                $"Rust evaluator failed: {error}");

        return output;
    }

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory != null)
        {
            if (Directory.Exists(
                Path.Combine(directory.FullName, "evaluator")))
                return directory.FullName;

            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException(
            "Could not find the ModelBench project root.");
    }
}
