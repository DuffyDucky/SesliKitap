import { useState, useCallback, useRef } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

interface UseSpeechResult {
  transcript: string;
  isListening: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
  error: string | null;
}

export function useSpeech(onResult?: (text: string) => void): UseSpeechResult {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const lastTranscriptRef = useRef('');
  const finalHandledRef = useRef(false);

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
    lastTranscriptRef.current = '';
    finalHandledRef.current = false;
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    // stop() çağrıldığında final result gelmeyebilir — son transcript'i kullan
    if (!finalHandledRef.current && lastTranscriptRef.current && onResultRef.current) {
      onResultRef.current(lastTranscriptRef.current);
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    setTranscript(text);
    lastTranscriptRef.current = text;
    if (event.isFinal && text && onResultRef.current) {
      finalHandledRef.current = true;
      onResultRef.current(text);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setError(event.error ?? 'Bilinmeyen hata');
    setIsListening(false);
  });

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError('Mikrofon izni reddedildi.');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'tr-TR',
      interimResults: true,
      continuous: false,
    });
  }, []);

  const stopListening = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { transcript, isListening, startListening, stopListening, error };
}
