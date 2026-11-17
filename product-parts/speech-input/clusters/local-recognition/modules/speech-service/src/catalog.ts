export interface SpeechModel {
  id: string; name: string; quantization: string; repository: string; revision: string;
  filename: string; sizeBytes: number; sha256: string; languages: string[];
  streaming: boolean; license: string; licenseUrl: string; source: string;
}

// Source: pinned Handy catalog, aca8985190c3ad7f361d8a80cb30f179513ed690.
export const SPEECH_MODELS: readonly SpeechModel[] = [
  {
    "id": "voxtral-q8",
    "name": "Voxtral Mini 4B Realtime",
    "quantization": "Q8_0",
    "repository": "handy-computer/Voxtral-Mini-4B-Realtime-2602-gguf",
    "revision": "b3e1c979e3775cbd0a49a65878a0ec7f06789ed7",
    "filename": "Voxtral-Mini-4B-Realtime-2602-Q8_0.gguf",
    "sizeBytes": 4731791648,
    "sha256": "6fb22249463c1e7a600d920ad732e2dd0a231510e9db59fb8061d3d1d48d0c67",
    "languages": [
      "en",
      "fr",
      "es",
      "de",
      "ru",
      "zh",
      "ja",
      "it",
      "pt",
      "nl",
      "ar",
      "hi",
      "ko"
    ],
    "streaming": true,
    "license": "Apache-2.0",
    "licenseUrl": "https://www.apache.org/licenses/LICENSE-2.0",
    "source": "https://huggingface.co/handy-computer/Voxtral-Mini-4B-Realtime-2602-gguf/tree/b3e1c979e3775cbd0a49a65878a0ec7f06789ed7"
  },
  {
    "id": "voxtral-q6",
    "name": "Voxtral Mini 4B Realtime",
    "quantization": "Q6_K",
    "repository": "handy-computer/Voxtral-Mini-4B-Realtime-2602-gguf",
    "revision": "b3e1c979e3775cbd0a49a65878a0ec7f06789ed7",
    "filename": "Voxtral-Mini-4B-Realtime-2602-Q6_K.gguf",
    "sizeBytes": 3661018912,
    "sha256": "92038784cffa20ea8ee925f10fd28c110285124d94730eacce48bab6c214fa48",
    "languages": [
      "en",
      "fr",
      "es",
      "de",
      "ru",
      "zh",
      "ja",
      "it",
      "pt",
      "nl",
      "ar",
      "hi",
      "ko"
    ],
    "streaming": true,
    "license": "Apache-2.0",
    "licenseUrl": "https://www.apache.org/licenses/LICENSE-2.0",
    "source": "https://huggingface.co/handy-computer/Voxtral-Mini-4B-Realtime-2602-gguf/tree/b3e1c979e3775cbd0a49a65878a0ec7f06789ed7"
  },
  {
    "id": "voxtral-q4",
    "name": "Voxtral Mini 4B Realtime",
    "quantization": "Q4_K_M",
    "repository": "handy-computer/Voxtral-Mini-4B-Realtime-2602-gguf",
    "revision": "b3e1c979e3775cbd0a49a65878a0ec7f06789ed7",
    "filename": "Voxtral-Mini-4B-Realtime-2602-Q4_K_M.gguf",
    "sizeBytes": 2830493984,
    "sha256": "39dc1f65539373a406edea7490505822d77c12edff521744678717eef4da4723",
    "languages": [
      "en",
      "fr",
      "es",
      "de",
      "ru",
      "zh",
      "ja",
      "it",
      "pt",
      "nl",
      "ar",
      "hi",
      "ko"
    ],
    "streaming": true,
    "license": "Apache-2.0",
    "licenseUrl": "https://www.apache.org/licenses/LICENSE-2.0",
    "source": "https://huggingface.co/handy-computer/Voxtral-Mini-4B-Realtime-2602-gguf/tree/b3e1c979e3775cbd0a49a65878a0ec7f06789ed7"
  }
];
export const DEFAULT_MODEL_ID = "voxtral-q8";
