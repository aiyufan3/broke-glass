import { Component, Fragment } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = { name: string; children: ReactNode }
type State = { error: Error | null; attempt: number }

/** Contains a failing paradigm so one community plugin cannot take the lab down, and lets it be remounted. */
export default class SpecimenBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`${this.props.name} failed to render and was contained.`, error, info.componentStack ?? '')
  }

  /** Remounts the paradigm from scratch: a new key discards whatever state it failed with. */
  retry = () => this.setState(({ attempt }) => ({ error: null, attempt: attempt + 1 }))

  render() {
    const { error, attempt } = this.state
    if (!error) return <Fragment key={attempt}>{this.props.children}</Fragment>
    return <section className="specimen-fault" role="alert">
      <strong>{this.props.name}</strong>
      <span>Specimen failed to render.</span>
      <code>{error.message}</code>
      <button type="button" onClick={this.retry}>Remount specimen</button>
    </section>
  }
}
