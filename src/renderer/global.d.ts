import type { CWApi } from '../preload/index';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare global {
  interface Window {
    api: CWApi;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          useragent?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
