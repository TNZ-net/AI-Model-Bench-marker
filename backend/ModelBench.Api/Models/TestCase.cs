
using System.ComponentModel.DataAnnotations;

namespace ModelBench.Api.Models;

public class TestCase
{
    public int Id { get; set; }

    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required]
    public string Input { get; set; } = string.Empty;

    [Required]
    public string ExpectedOutput { get; set; } = string.Empty;
}
