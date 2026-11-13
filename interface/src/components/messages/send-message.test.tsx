import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_MESSAGE_LENGTH, type ChatMessage } from "@/services/send-message";
import { SendMessage } from "./send-message";

type FetchCall = { url: string; init?: RequestInit };

const fetchCalls: FetchCall[] = [];
const chatBodies: Array<{ messages: ChatMessage[] }> = [];
const playResults: unknown[] = [];
const frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
let nextObjectUrlId = 1;
let frequencyValue = 180;
let microphoneAmplitude = 0.2;
let recordedAudio = new Blob(["recorded-audio"], { type: "audio/webm;codecs=opus" });

const microphoneTrack = { stop: vi.fn() };
const microphoneStream = { getTracks: vi.fn(() => [microphoneTrack]) } as unknown as MediaStream;
const getUserMediaMock = vi.fn(async () => microphoneStream);

class MediaRecorderMock {
    static instances: MediaRecorderMock[] = [];
    static isTypeSupported = vi.fn((mimeType: string) => mimeType === "audio/webm;codecs=opus");

    state: RecordingState = "inactive";
    mimeType: string;
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;
    start = vi.fn(() => {
        this.state = "recording";
    });
    stop = vi.fn(() => {
        this.state = "inactive";
        this.ondataavailable?.({ data: recordedAudio } as BlobEvent);
        this.onstop?.(new Event("stop"));
    });

    constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        this.mimeType = options?.mimeType ?? "audio/webm";
        MediaRecorderMock.instances.push(this);
    }
}

class AudioMock {
    static instances: AudioMock[] = [];

    src = "";
    currentTime = 0;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play = vi.fn(async () => {
        const result = playResults.shift();
        if (result instanceof Error || result instanceof DOMException) throw result;
    });
    pause = vi.fn();
    load = vi.fn();
    removeAttribute = vi.fn((attribute: string) => {
        if (attribute === "src") this.src = "";
    });

    constructor() {
        AudioMock.instances.push(this);
    }
}

class AudioContextMock {
    static instances: AudioContextMock[] = [];

    state: AudioContextState = "running";
    destination = {} as AudioDestinationNode;
    analyser = {
        fftSize: 0,
        smoothingTimeConstant: 0,
        frequencyBinCount: 128,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getByteFrequencyData: vi.fn((values: Uint8Array) => values.fill(frequencyValue)),
        getFloatTimeDomainData: vi.fn((values: Float32Array) => values.fill(microphoneAmplitude)),
    };
    source = { connect: vi.fn(), disconnect: vi.fn() };
    resume = vi.fn(async () => undefined);
    close = vi.fn(async () => undefined);
    createAnalyser = vi.fn(() => this.analyser);
    createMediaElementSource = vi.fn(() => this.source);
    createMediaStreamSource = vi.fn(() => this.source);

    constructor() {
        AudioContextMock.instances.push(this);
    }
}

function jsonResponse(body: unknown, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => "application/json" },
        json: vi.fn(async () => body),
        blob: vi.fn(),
    } as unknown as Response;
}

function audioResponse(status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => "audio/mpeg" },
        json: vi.fn(),
        blob: vi.fn(async () => new Blob(["audio"], { type: "audio/mpeg" })),
    } as unknown as Response;
}

function installFetch(handlers?: {
    chat?: (messages: ChatMessage[], callIndex: number) => Response | Promise<Response>;
    speech?: (init: RequestInit | undefined, callIndex: number) => Response | Promise<Response>;
    transcription?: (init: RequestInit | undefined, callIndex: number) => Response | Promise<Response>;
}) {
    let chatCallIndex = 0;
    let speechCallIndex = 0;
    let transcriptionCallIndex = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.endsWith("/chat")) {
            const body = JSON.parse(String(init?.body)) as { messages: ChatMessage[] };
            chatBodies.push(body);
            const currentIndex = chatCallIndex++;
            return handlers?.chat?.(body.messages, currentIndex)
                ?? jsonResponse({ message: { role: "assistant", content: `Resposta ${currentIndex + 1}` } });
        }
        if (url.endsWith("/speech")) {
            return handlers?.speech?.(init, speechCallIndex++) ?? audioResponse();
        }
        if (url.endsWith("/transcriptions")) {
            return handlers?.transcription?.(init, transcriptionCallIndex++)
                ?? jsonResponse({ text: "Pergunta transcrita" });
        }
        throw new Error(`URL inesperada: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

async function submitQuestion(text: string) {
    const input = screen.getByLabelText("Pergunte ao Jarvas");
    fireEvent.change(input, { target: { value: text } });
    await userEvent.click(screen.getByRole("button", { name: "Enviar pergunta" }));
}

async function waitForChatCalls(count: number) {
    await waitFor(() => expect(chatBodies).toHaveLength(count));
    await waitFor(() => expect(screen.getByLabelText("Pergunte ao Jarvas")).toHaveValue(""));
}

async function startRecordingWithSpeech() {
    await userEvent.click(screen.getByRole("button", { name: "Iniciar gravação" }));
    const stopButton = await screen.findByRole("button", { name: "Parar gravação" });
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
    });
    return stopButton;
}

beforeEach(() => {
    fetchCalls.length = 0;
    chatBodies.length = 0;
    playResults.length = 0;
    frameCallbacks.clear();
    nextFrameId = 1;
    nextObjectUrlId = 1;
    frequencyValue = 180;
    microphoneAmplitude = 0.2;
    AudioMock.instances.length = 0;
    AudioContextMock.instances.length = 0;
    MediaRecorderMock.instances.length = 0;
    MediaRecorderMock.isTypeSupported.mockClear();
    microphoneTrack.stop.mockClear();
    getUserMediaMock.mockClear();
    recordedAudio = new Blob(["recorded-audio"], { type: "audio/webm;codecs=opus" });

    vi.stubGlobal("Audio", AudioMock);
    vi.stubGlobal("AudioContext", AudioContextMock);
    vi.stubGlobal("MediaRecorder", MediaRecorderMock);
    Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: getUserMediaMock },
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        frameCallbacks.set(id, callback);
        return id;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frameCallbacks.delete(id)));
    vi.stubGlobal("matchMedia", vi.fn(() => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: vi.fn(() => `blob:jarvas-${nextObjectUrlId++}`),
        revokeObjectURL: vi.fn(),
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("conversa por texto", () => {
    it("envia o histórico na ordem correta e não duplica a pergunta mais recente", async () => {
        installFetch({
            chat: (_messages, index) => jsonResponse({
                message: { role: "assistant", content: index === 0 ? "Albert Einstein foi um físico." : "Ele nasceu em Ulm." },
            }),
        });
        render(<SendMessage />);

        await submitQuestion("Quem foi Albert Einstein?");
        await waitForChatCalls(1);
        await submitQuestion("Onde ele nasceu?");
        await waitForChatCalls(2);

        expect(chatBodies[1].messages).toEqual([
            { role: "user", content: "Quem foi Albert Einstein?" },
            { role: "assistant", content: "Albert Einstein foi um físico." },
            { role: "user", content: "Onde ele nasceu?" },
        ]);
        expect(chatBodies[1].messages.filter((item) => item.content === "Onde ele nasceu?")).toHaveLength(1);
        expect(chatBodies[1].messages.every((item) => Object.keys(item).sort().join(",") === "content,role")).toBe(true);
    });

    it("preserva o texto e o contexto confirmado quando o chat falha", async () => {
        installFetch({
            chat: (_messages, index) => {
                if (index === 1) return Promise.reject(new Error("indisponível"));
                return jsonResponse({ message: { role: "assistant", content: `Resposta ${index + 1}` } });
            },
        });
        render(<SendMessage />);

        await submitQuestion("Primeira pergunta");
        await waitForChatCalls(1);
        await submitQuestion("Pergunta para tentar novamente");
        await screen.findByText("Não foi possível enviar sua mensagem. Tente novamente.");

        expect(screen.getByLabelText("Pergunte ao Jarvas")).toHaveValue("Pergunta para tentar novamente");
        await userEvent.click(screen.getByRole("button", { name: "Enviar pergunta" }));
        await waitForChatCalls(3);
        expect(chatBodies[2].messages).toEqual([
            { role: "user", content: "Primeira pergunta" },
            { role: "assistant", content: "Resposta 1" },
            { role: "user", content: "Pergunta para tentar novamente" },
        ]);
    });

    it("descarta os pares mais antigos ao alcançar o limite de mensagens", async () => {
        installFetch();
        render(<SendMessage />);

        for (let turn = 1; turn <= 11; turn += 1) {
            await submitQuestion(`Pergunta ${turn}`);
            await waitForChatCalls(turn);
        }

        expect(chatBodies[10].messages).toHaveLength(19);
        expect(chatBodies[10].messages[0]).toEqual({ role: "user", content: "Pergunta 2" });
        expect(chatBodies[10].messages.at(-1)).toEqual({ role: "user", content: "Pergunta 11" });
    });

    it("descarta pares antigos quando o conteúdo total ultrapassaria o limite", async () => {
        installFetch({
            chat: (_messages, index) => jsonResponse({
                message: { role: "assistant", content: String(index + 1).repeat(3_900) },
            }),
        });
        render(<SendMessage />);

        for (let turn = 1; turn <= 5; turn += 1) {
            await submitQuestion(String(turn).repeat(1_000));
            await waitForChatCalls(turn);
        }

        expect(chatBodies[4].messages[0].content).toBe("2".repeat(1_000));
        expect(chatBodies[4].messages.reduce((total, item) => total + item.content.length, 0)).toBeLessThanOrEqual(20_000);
    });

    it("não envia texto acima do limite individual", async () => {
        const fetchMock = installFetch();
        render(<SendMessage />);
        fireEvent.change(screen.getByLabelText("Pergunte ao Jarvas"), {
            target: { value: "a".repeat(MAX_MESSAGE_LENGTH + 1) },
        });

        await userEvent.click(screen.getByRole("button", { name: "Enviar pergunta" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("no máximo 4.000 caracteres");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("entrada por áudio", () => {
    it("grava, envia multipart e usa a transcrição no chat com o histórico", async () => {
        installFetch({
            transcription: (_init, index) => jsonResponse({
                text: index === 0 ? "Quem foi Albert Einstein?" : "Onde ele nasceu?",
            }),
            chat: (_messages, index) => jsonResponse({
                message: { role: "assistant", content: index === 0 ? "Einstein foi um físico." : "Ele nasceu em Ulm." },
            }),
        });
        render(<SendMessage />);

        const firstStopButton = await startRecordingWithSpeech();
        expect(firstStopButton).toBeEnabled();
        expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
        expect(MediaRecorderMock.instances[0].start).toHaveBeenCalledOnce();
        await userEvent.click(firstStopButton);
        await waitForChatCalls(1);

        const transcriptionCall = fetchCalls.find(({ url }) => url.endsWith("/transcriptions"));
        const form = transcriptionCall?.init?.body as FormData;
        const file = form.get("file") as File;
        expect(transcriptionCall?.init?.headers).toBeUndefined();
        expect(file.name).toBe("question.webm");
        expect(file.type).toBe("audio/webm;codecs=opus");
        expect(microphoneTrack.stop).toHaveBeenCalled();
        expect(chatBodies[0].messages).toEqual([{ role: "user", content: "Quem foi Albert Einstein?" }]);

        await screen.findByRole("button", { name: "Parar" });
        const secondStopButton = await startRecordingWithSpeech();
        expect(AudioMock.instances[0].pause).toHaveBeenCalled();
        await userEvent.click(secondStopButton);
        await waitForChatCalls(2);
        expect(chatBodies[1].messages).toEqual([
            { role: "user", content: "Quem foi Albert Einstein?" },
            { role: "assistant", content: "Einstein foi um físico." },
            { role: "user", content: "Onde ele nasceu?" },
        ]);
        expect(chatBodies[1].messages.filter(({ content }) => content === "Onde ele nasceu?")).toHaveLength(1);
    });

    it.each([
        ["NotAllowedError", "permissão para usar o microfone foi negada"],
        ["NotFoundError", "Nenhum microfone foi encontrado"],
        ["NotReadableError", "microfone está indisponível"],
    ])("trata falha de microfone %s e mantém o texto disponível", async (name, expectedMessage) => {
        getUserMediaMock.mockRejectedValueOnce(new DOMException("falha", name));
        const fetchMock = installFetch();
        render(<SendMessage />);

        await userEvent.click(screen.getByRole("button", { name: "Iniciar gravação" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(expectedMessage);
        expect(screen.getByLabelText("Pergunte ao Jarvas")).toBeEnabled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("informa quando a API de gravação não é suportada", async () => {
        vi.stubGlobal("MediaRecorder", undefined);
        const fetchMock = installFetch();
        render(<SendMessage />);

        await userEvent.click(screen.getByRole("button", { name: "Iniciar gravação" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("não oferece suporte à gravação de áudio");
        expect(screen.getByLabelText("Pergunte ao Jarvas")).toBeEnabled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        [jsonResponse({ text: "   " }), "Não foi possível identificar fala"],
        [jsonResponse({ error: "indisponível" }, 502), "Não foi possível transcrever o áudio"],
    ])("não envia ao chat quando a transcrição é inválida", async (transcriptionResponse, expectedMessage) => {
        const fetchMock = installFetch({ transcription: () => transcriptionResponse });
        render(<SendMessage />);

        await userEvent.click(await startRecordingWithSpeech());

        expect(await screen.findByRole("alert")).toHaveTextContent(expectedMessage);
        expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/chat"))).toHaveLength(0);
        expect(screen.getByLabelText("Pergunte ao Jarvas")).toBeEnabled();
    });

    it("não envia uma transcrição acima do limite e permite editá-la", async () => {
        const longTranscription = "a".repeat(MAX_MESSAGE_LENGTH + 1);
        installFetch({ transcription: () => jsonResponse({ text: longTranscription }) });
        render(<SendMessage />);

        await userEvent.click(await startRecordingWithSpeech());

        expect(await screen.findByRole("alert")).toHaveTextContent("transcrição excedeu 4.000 caracteres");
        expect(screen.getByLabelText("Pergunte ao Jarvas")).toHaveValue(longTranscription);
        expect(chatBodies).toHaveLength(0);
    });

    it("encerra o gravador e as faixas do microfone ao desmontar", async () => {
        installFetch();
        const { unmount } = render(<SendMessage />);
        await userEvent.click(screen.getByRole("button", { name: "Iniciar gravação" }));
        await screen.findByRole("button", { name: "Parar gravação" });
        const recorder = MediaRecorderMock.instances[0];

        unmount();

        expect(recorder.stop).toHaveBeenCalled();
        expect(microphoneTrack.stop).toHaveBeenCalled();
        expect(AudioContextMock.instances[0].source.disconnect).toHaveBeenCalled();
        expect(AudioContextMock.instances[0].close).toHaveBeenCalled();
        expect(fetchCalls.some(({ url }) => url.endsWith("/transcriptions"))).toBe(false);
    });

    it("cancela a gravação sem enviar o áudio para transcrição", async () => {
        installFetch();
        render(<SendMessage />);
        await userEvent.click(screen.getByRole("button", { name: "Iniciar gravação" }));
        await screen.findByRole("button", { name: "Parar gravação" });

        await userEvent.click(screen.getByRole("button", { name: "Cancelar gravação" }));

        expect(MediaRecorderMock.instances[0].stop).toHaveBeenCalled();
        expect(microphoneTrack.stop).toHaveBeenCalled();
        expect(AudioContextMock.instances[0].source.disconnect).toHaveBeenCalled();
        expect(AudioContextMock.instances[0].close).toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Iniciar gravação" })).toBeEnabled();
        expect(fetchCalls.some(({ url }) => url.endsWith("/transcriptions"))).toBe(false);
    });

    it("encerra e envia uma vez após fala seguida de 8 segundos de silêncio", async () => {
        vi.useFakeTimers();
        try {
            installFetch();
            render(<SendMessage />);
            fireEvent.click(screen.getByRole("button", { name: "Iniciar gravação" }));
            await act(async () => {
                await Promise.resolve();
                await vi.advanceTimersByTimeAsync(300);
            });
            expect(screen.getByText("Gravando… ouvindo sua pergunta")).toBeVisible();

            microphoneAmplitude = 0;
            await act(async () => {
                await vi.advanceTimersByTimeAsync(8_000);
            });

            expect(MediaRecorderMock.instances[0].stop).toHaveBeenCalledTimes(1);
            expect(fetchCalls.filter(({ url }) => url.endsWith("/transcriptions"))).toHaveLength(1);
            expect(chatBodies).toHaveLength(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("reinicia a contagem de silêncio quando a fala retorna", async () => {
        vi.useFakeTimers();
        try {
            installFetch();
            render(<SendMessage />);
            fireEvent.click(screen.getByRole("button", { name: "Iniciar gravação" }));
            await act(async () => {
                await Promise.resolve();
                await vi.advanceTimersByTimeAsync(300);
            });

            microphoneAmplitude = 0;
            await act(async () => {
                await vi.advanceTimersByTimeAsync(7_000);
            });
            microphoneAmplitude = 0.2;
            await act(async () => {
                await vi.advanceTimersByTimeAsync(300);
            });
            microphoneAmplitude = 0;
            await act(async () => {
                await vi.advanceTimersByTimeAsync(7_900);
            });
            expect(MediaRecorderMock.instances[0].stop).not.toHaveBeenCalled();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(100);
            });
            expect(MediaRecorderMock.instances[0].stop).toHaveBeenCalledTimes(1);
            expect(fetchCalls.filter(({ url }) => url.endsWith("/transcriptions"))).toHaveLength(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("não duplica o envio quando a parada manual ocorre perto do prazo de silêncio", async () => {
        vi.useFakeTimers();
        try {
            installFetch();
            render(<SendMessage />);
            fireEvent.click(screen.getByRole("button", { name: "Iniciar gravação" }));
            await act(async () => {
                await Promise.resolve();
                await vi.advanceTimersByTimeAsync(300);
            });
            microphoneAmplitude = 0;
            await act(async () => {
                await vi.advanceTimersByTimeAsync(7_900);
            });

            fireEvent.click(screen.getByRole("button", { name: "Parar gravação" }));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1_000);
            });

            expect(MediaRecorderMock.instances[0].stop).toHaveBeenCalledTimes(1);
            expect(fetchCalls.filter(({ url }) => url.endsWith("/transcriptions"))).toHaveLength(1);
            expect(AudioContextMock.instances[0].close).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("encerra sem enviar quando o limite máximo é atingido sem fala", async () => {
        vi.useFakeTimers();
        try {
            microphoneAmplitude = 0;
            installFetch();
            render(<SendMessage />);
            fireEvent.click(screen.getByRole("button", { name: "Iniciar gravação" }));
            await act(async () => {
                await Promise.resolve();
                await vi.advanceTimersByTimeAsync(60_000);
            });

            expect(MediaRecorderMock.instances[0].stop).toHaveBeenCalledTimes(1);
            expect(microphoneTrack.stop).toHaveBeenCalled();
            expect(fetchCalls.some(({ url }) => url.endsWith("/transcriptions"))).toBe(false);
            expect(screen.getByRole("alert")).toHaveTextContent("sem detectar fala");
        } finally {
            vi.useRealTimers();
        }
    });

    it("encerra e envia automaticamente a gravação ao atingir 60 segundos", async () => {
        vi.useFakeTimers();
        try {
            installFetch();
            render(<SendMessage />);
            fireEvent.click(screen.getByRole("button", { name: "Iniciar gravação" }));
            await act(async () => {
                await Promise.resolve();
            });
            expect(screen.getByRole("button", { name: "Parar gravação" })).toBeEnabled();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(60_000);
            });

            expect(MediaRecorderMock.instances[0].stop).toHaveBeenCalled();
            expect(microphoneTrack.stop).toHaveBeenCalled();
            expect(chatBodies).toHaveLength(1);
            expect(chatBodies[0].messages[0]).toEqual({ role: "user", content: "Pergunta transcrita" });
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("síntese, reprodução e limpeza", () => {
    it("para e repete o áudio já disponível sem solicitar nova síntese", async () => {
        installFetch();
        render(<SendMessage />);
        await submitQuestion("Fale comigo");
        await screen.findByRole("button", { name: "Parar" });

        const audio = AudioMock.instances[0];
        expect(audio.play).toHaveBeenCalledTimes(1);
        await userEvent.click(screen.getByRole("button", { name: "Parar" }));
        expect(audio.pause).toHaveBeenCalled();
        expect(audio.currentTime).toBe(0);

        await userEvent.click(screen.getByRole("button", { name: "Repetir" }));
        await screen.findByRole("button", { name: "Parar" });
        expect(audio.play).toHaveBeenCalledTimes(2);
        expect(fetchCalls.filter(({ url }) => url.endsWith("/speech"))).toHaveLength(1);
    });

    it("mantém o contexto e permite nova tentativa quando a síntese falha", async () => {
        installFetch({ speech: (_init, index) => index === 0 ? audioResponse(502) : audioResponse() });
        render(<SendMessage />);
        await submitQuestion("Pergunta com falha de voz");
        expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível gerar o áudio");

        await userEvent.click(screen.getByRole("button", { name: "Tentar gerar novamente" }));
        await screen.findByRole("button", { name: "Parar" });
        expect(fetchCalls.filter(({ url }) => url.endsWith("/speech"))).toHaveLength(2);

        await submitQuestion("Pergunta seguinte");
        await waitForChatCalls(2);
        expect(chatBodies[1].messages[1]).toEqual({ role: "assistant", content: "Resposta 1" });
    });

    it("oferece reprodução manual quando o autoplay é bloqueado", async () => {
        playResults.push(new DOMException("bloqueado", "NotAllowedError"));
        installFetch();
        render(<SendMessage />);
        await submitQuestion("Teste de autoplay");

        expect(await screen.findByRole("alert")).toHaveTextContent("reprodução automática foi bloqueada");
        await userEvent.click(screen.getByRole("button", { name: "Reproduzir" }));
        await screen.findByRole("button", { name: "Parar" });
        expect(fetchCalls.filter(({ url }) => url.endsWith("/speech"))).toHaveLength(1);
    });

    it("informa uma falha de reprodução sem solicitar outra síntese", async () => {
        playResults.push(new Error("falha no decodificador"));
        installFetch();
        render(<SendMessage />);
        await submitQuestion("Teste de reprodução");

        expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível reproduzir o áudio");
        expect(screen.getByRole("button", { name: "Reproduzir" })).toBeEnabled();
        expect(fetchCalls.filter(({ url }) => url.endsWith("/speech"))).toHaveLength(1);
    });

    it("cancela uma síntese atrasada quando uma nova pergunta é enviada", async () => {
        let firstSignal: AbortSignal | undefined;
        installFetch({
            speech: (init, index) => {
                if (index > 0) return audioResponse();
                firstSignal = init?.signal ?? undefined;
                return new Promise<Response>((_resolve, reject) => {
                    firstSignal?.addEventListener("abort", () => reject(new DOMException("cancelada", "AbortError")));
                });
            },
        });
        render(<SendMessage />);
        await submitQuestion("Primeira pergunta");
        await screen.findByText("Gerando áudio…");
        await submitQuestion("Segunda pergunta");
        await screen.findByRole("button", { name: "Parar" });

        expect(firstSignal?.aborted).toBe(true);
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(AudioMock.instances[0].play).toHaveBeenCalledTimes(1);
    });

    it("faz as barras reagirem ao analisador e as recolhe ao parar", async () => {
        installFetch();
        render(<SendMessage />);
        await submitQuestion("Visualize o áudio");
        await screen.findByRole("button", { name: "Parar" });
        const visualizer = screen.getByRole("img", { name: /Barras de energia/ });
        const firstBar = visualizer.firstElementChild as HTMLElement;
        const quietTransform = firstBar.style.transform;
        const frame = [...frameCallbacks.values()].at(-1);

        act(() => frame?.(100));
        expect(firstBar.style.transform).not.toBe(quietTransform);
        expect(firstBar.style.boxShadow).toContain("hsla");

        await userEvent.click(screen.getByRole("button", { name: "Parar" }));
        expect(firstBar.style.transform).toBe(quietTransform);
    });

    it("mantém o visualizador estático quando movimento reduzido está ativo", async () => {
        vi.stubGlobal("matchMedia", vi.fn(() => ({
            matches: true,
            media: "(prefers-reduced-motion: reduce)",
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })));
        installFetch();
        render(<SendMessage />);
        await submitQuestion("Teste com movimento reduzido");
        await screen.findByRole("button", { name: "Parar" });

        expect(requestAnimationFrame).not.toHaveBeenCalled();
        expect(screen.getByRole("img", { name: /em reprodução/ })).toBeVisible();
    });

    it("revoga a URL, interrompe o áudio e fecha o contexto ao desmontar", async () => {
        installFetch();
        const { unmount } = render(<SendMessage />);
        await submitQuestion("Teste de limpeza");
        await screen.findByRole("button", { name: "Parar" });
        const audio = AudioMock.instances[0];
        const context = AudioContextMock.instances[0];

        unmount();

        expect(audio.pause).toHaveBeenCalled();
        expect(audio.removeAttribute).toHaveBeenCalledWith("src");
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:jarvas-1");
        expect(context.close).toHaveBeenCalled();
        expect(cancelAnimationFrame).toHaveBeenCalled();
    });
});
