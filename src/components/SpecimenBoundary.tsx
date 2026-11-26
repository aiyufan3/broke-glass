import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = { name: string; children: ReactNode }
type State = { error: Error | null; componentStack: string }

/**
 * Contains a failing paradigm so one community plugin cannot take the lab down. React already reports
 * the error to the console; the boundary keeps the message and component stack on the fault plate and
 * lets the paradigm be mounted again without reloading the lab.
 */
export default class SpecimenBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '' }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(_: unknown, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack?.trim() ?? '' })
  }

  /** The failed subtree is already unmounted, so clearing the error mounts the paradigm from scratch. */
  retry = () => this.setState({ error: null, componentStack: '' })

  render() {
    const { error, componentStack } = this.state
    if (!error) return this.props.children
    return <section className="specimen-fault" role="alert">
      <strong>{this.props.name}</strong>
      <span>Specimen failed to render.</span>
      <code>{error.message}</code>
      {componentStack && <details><summary>Component stack</summary><pre>{componentStack}</pre></details>}
      <button type="button" onClick={this.retry}>Remount specimen</button>
    </section>
  }
}
