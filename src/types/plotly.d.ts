/**
 * `plotly.js-basic-dist-min` ships no type declarations. Only the handful of
 * calls this project makes are declared, so a typo in a Plotly call is still a
 * compile error rather than `any` everywhere.
 */
declare module 'plotly.js-basic-dist-min' {
  export interface PlotlyLayout {
    [key: string]: unknown;
  }
  export interface PlotlyTrace {
    [key: string]: unknown;
  }
  export interface PlotlyConfig {
    [key: string]: unknown;
  }

  const Plotly: {
    react(
      element: HTMLElement,
      data: PlotlyTrace[],
      layout?: PlotlyLayout,
      config?: PlotlyConfig,
    ): Promise<unknown>;
    purge(element: HTMLElement): void;
    Plots: { resize(element: HTMLElement): void };
    downloadImage(
      element: HTMLElement,
      options: { format: 'png' | 'svg'; filename: string; width?: number; height?: number },
    ): Promise<string>;
  };

  export default Plotly;
}
