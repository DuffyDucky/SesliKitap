import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Speech from 'expo-speech';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary:', error);
    Speech.speak('Bir hata oluştu. Ekrana dokunarak yeniden başlatabilirsiniz.', {
      language: 'tr-TR',
    });
  }

  handleRestart = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Bir Hata Oluştu</Text>
          <Text style={styles.subtitle}>Uygulamayı yeniden başlatmak için dokunun</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={this.handleRestart}
            accessibilityLabel="Uygulamayı yeniden başlat"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Yeniden Başlat</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    color: '#aaa',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 16,
    minWidth: 200,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
});
