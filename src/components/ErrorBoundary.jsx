import { Component } from 'react'

// Catches render-time crashes in whichever tab is active so one bad tab
// can't take down the whole app shell (nav stays usable, data stays safe —
// nothing here ever writes to storage).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Tab crashed:', error, info)
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty-state-sm">
          Something went wrong showing this tab. Your saved data hasn't been touched — try switching tabs or
          reloading the page.
        </div>
      )
    }
    return this.props.children
  }
}
