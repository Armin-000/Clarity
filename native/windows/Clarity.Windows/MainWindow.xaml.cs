using Microsoft.Web.WebView2.Core;
using System.IO;
using System.Text.Json;
using System.Windows;
using Windows.Globalization;
using Windows.Media.SpeechRecognition;

namespace Clarity.Windows;

public partial class MainWindow : Window
{
    private SpeechRecognizer? recognizer;
    private string? activeId;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await InitializeAsync();
        Closed += async (_, _) => await ShutdownAsync();
    }

    private async Task InitializeAsync()
    {
        await Web.EnsureCoreWebView2Async();
        var www = Path.Combine(AppContext.BaseDirectory, "www");
        Web.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "clarity.local",
            www,
            CoreWebView2HostResourceAccessKind.DenyCors);
        Web.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
        Web.CoreWebView2.Navigate("https://clarity.local/index.html");
    }

    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            var action = root.GetProperty("action").GetString() ?? "";
            var id = root.GetProperty("id").GetString() ?? "";
            var config = root.TryGetProperty("config", out var cfg) ? cfg : default;

            switch (action)
            {
                case "start": await StartAsync(id, config); break;
                case "stop": await StopAsync(id); break;
                case "abort": await AbortAsync(id); break;
            }
        }
        catch (Exception ex)
        {
            if (activeId is { } id)
                Emit(id, "error", error: "unknown", message: ex.Message);
        }
    }

    private async Task StartAsync(string id, JsonElement config)
    {
        if (recognizer != null) await AbortAsync(activeId ?? id);
        activeId = id;

        var languageTag = config.ValueKind == JsonValueKind.Object && config.TryGetProperty("language", out var lang)
            ? lang.GetString() ?? "hr-HR"
            : "hr-HR";

        try
        {
            recognizer = new SpeechRecognizer(new Language(languageTag));
            recognizer.Constraints.Add(new SpeechRecognitionTopicConstraint(SpeechRecognitionScenario.Dictation, "clarity-dictation"));
            var compile = await recognizer.CompileConstraintsAsync();
            if (compile.Status != SpeechRecognitionResultStatus.Success)
                throw new InvalidOperationException($"Speech grammar nije dostupna: {compile.Status}");

            recognizer.HypothesisGenerated += (_, args) =>
            {
                if (activeId == id && !string.IsNullOrWhiteSpace(args.Hypothesis.Text))
                    Dispatcher.Invoke(() => Emit(id, "partial", transcript: args.Hypothesis.Text, confidence: 0));
            };

            recognizer.ContinuousRecognitionSession.ResultGenerated += (_, args) =>
            {
                if (activeId == id && !string.IsNullOrWhiteSpace(args.Result.Text))
                    Dispatcher.Invoke(() => Emit(id, "final", transcript: args.Result.Text, confidence: Confidence(args.Result.Confidence)));
            };

            recognizer.ContinuousRecognitionSession.Completed += (_, args) =>
            {
                if (activeId != id) return;
                Dispatcher.Invoke(() =>
                {
                    Emit(id, "speechend");
                    Emit(id, "end");
                    activeId = null;
                    recognizer?.Dispose();
                    recognizer = null;
                });
            };

            Emit(id, "start");
            await recognizer.ContinuousRecognitionSession.StartAsync(SpeechContinuousRecognitionMode.Default);
            Emit(id, "speechstart");
        }
        catch (UnauthorizedAccessException ex)
        {
            Emit(id, "error", error: "not-allowed", message: ex.Message);
            Emit(id, "end");
            recognizer?.Dispose(); recognizer = null; activeId = null;
        }
        catch (Exception ex)
        {
            Emit(id, "error", error: "service-not-allowed", message: ex.Message);
            Emit(id, "end");
            recognizer?.Dispose(); recognizer = null; activeId = null;
        }
    }

    private async Task StopAsync(string id)
    {
        if (activeId != id || recognizer == null) return;
        await recognizer.ContinuousRecognitionSession.StopAsync();
    }

    private async Task AbortAsync(string id)
    {
        if (activeId != id || recognizer == null) return;
        try { await recognizer.ContinuousRecognitionSession.CancelAsync(); } catch { }
        Emit(id, "end");
        recognizer.Dispose(); recognizer = null; activeId = null;
    }

    private async Task ShutdownAsync()
    {
        if (activeId is { } id) await AbortAsync(id);
    }

    private void Emit(string id, string type, string? transcript = null, double? confidence = null, string? error = null, string? message = null)
    {
        var payload = new Dictionary<string, object?> { ["id"] = id, ["type"] = type };
        if (transcript != null) payload["transcript"] = transcript;
        if (confidence != null) payload["confidence"] = confidence;
        if (error != null) payload["error"] = error;
        if (message != null) payload["message"] = message;
        Web.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(payload));
    }

    private static double Confidence(SpeechRecognitionConfidence value) => value switch
    {
        SpeechRecognitionConfidence.High => 0.9,
        SpeechRecognitionConfidence.Medium => 0.7,
        SpeechRecognitionConfidence.Low => 0.45,
        _ => 0
    };
}
