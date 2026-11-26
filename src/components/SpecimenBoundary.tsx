import { Component } from 'react'
import type { ReactNode } from 'react'

type Props = { name: string; children: ReactNode }

/** Contains a failing paradigm so one community plugin cannot take the lab down. */
export default class SpecimenBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <section className="specimen-fault" role="alert">
      <strong>{this.props.name}</strong>
      <span>Specimen failed to render.</span>
    </section>
  }
}
