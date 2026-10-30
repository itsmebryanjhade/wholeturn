import { useEffect, useRef } from 'react'
import heroPhoto from '../../assets/mindful-equilibrium-hero.jpg'
import { BrandMark } from '../../components/BrandMark.jsx'
import {
  demoRoles,
  demoSessions,
  demoSnapshot,
  demoTransitions,
  demoValues,
} from '../../data/demoData.js'
import './welcome-page.css'

function formatDemoTime(timestamp) {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: demoSnapshot.timeZone,
  }).format(new Date(timestamp))
}

function SampleTransition() {
  const transition = demoTransitions.at(-1)
  const outgoing = demoSessions.find(({ id }) => id === transition.outgoingSessionId)
  const incoming = demoSessions.find(({ id }) => id === transition.incomingSessionId)
  const outgoingRole = demoRoles.find(({ id }) => id === outgoing.roleId)
  const incomingRole = demoRoles.find(({ id }) => id === incoming.roleId)
  const values = demoValues
    .filter(({ id }) => transition.valueIds.includes(id))
    .map(({ label }) => label)

  return (
    <aside className="welcome-sample" data-ui aria-label="Fictional sample transition">
      <header className="welcome-sample-header">
        <div>
          <p className="welcome-sample-label">A moment in a sample day</p>
          <p className="welcome-sample-date">Fictional data</p>
        </div>
        <span className="welcome-sample-mark" aria-hidden="true">
          <BrandMark />
        </span>
      </header>

      <div className="welcome-sample-flow">
        <div className="welcome-role-row">
          <span className="welcome-role-dot" aria-hidden="true" />
          <div>
            <strong>{outgoingRole.name}</strong>
            <span>{formatDemoTime(outgoing.startedAt)} – {formatDemoTime(outgoing.endedAt)}</span>
          </div>
        </div>

        <section className="welcome-transition" aria-labelledby="sample-transition-title">
          <p className="welcome-transition-label">
            At the switch
            <time dateTime={transition.switchedAt}>{formatDemoTime(transition.switchedAt)}</time>
          </p>
          <h2 id="sample-transition-title" aria-label={`${outgoingRole.name} to ${incomingRole.name}`}>
            {outgoingRole.name} <span aria-hidden="true">→</span> {incomingRole.name}
          </h2>
          <div className="welcome-sample-energy" role="group" aria-label={`Energy ${transition.energyBefore} to ${transition.energyAfter}`}>
            <span>Energy</span>
            <strong>{transition.energyBefore} <span aria-hidden="true">→</span> {transition.energyAfter}</strong>
          </div>
          <div className="welcome-sample-focus">
            <span>Focus intention</span>
            <p>{transition.focusIntention}</p>
          </div>
          <div className="welcome-sample-values" aria-label={`Values: ${values.join(', ')}`}>
            <span>Values</span>
            <span>{values.join(' · ')}</span>
          </div>
        </section>

        <div className="welcome-role-row welcome-role-active">
          <span className="welcome-role-dot" aria-hidden="true" />
          <div>
            <strong>{incomingRole.name}</strong>
            <span>From {formatDemoTime(incoming.startedAt)}</span>
          </div>
          <span className="welcome-current-label">Current role</span>
        </div>
      </div>
    </aside>
  )
}

export function WelcomePage({ onSignIn, onCreateAccount, onExploreDemo }) {
  const pageRef = useRef(null)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target.matches('.welcome-daybook')) {
          if (entry.isIntersecting) {
            entry.target.classList.add('welcome-daybook-active')
            observer.unobserve(entry.target)
          }
        } else if (entry.isIntersecting) {
          if (entry.target.classList.contains('welcome-scroll-ready')) {
            entry.target.classList.replace('welcome-scroll-ready', 'welcome-scroll-active')
          }
          observer.unobserve(entry.target)
        } else if (entry.boundingClientRect.top >= window.innerHeight) {
          entry.target.classList.add('welcome-scroll-ready')
        }
      }
    }, { threshold: 0.05 })

    pageRef.current.querySelectorAll([
      '.welcome-section-intro h2',
      '.welcome-section-intro > p:first-of-type',
      '.welcome-daybook-entry h3',
      '.welcome-daybook-entry > p',
      '.welcome-trust-intro h2',
      '.welcome-trust-intro > p',
      '.welcome-trust-evidence-row h3',
      '.welcome-trust-evidence-row p',
      '.welcome-faq-intro h2',
      '.welcome-faq-intro > p',
      '.welcome-faq-list dt',
      '.welcome-faq-list dd',
      '.welcome-final-cta h2',
      '.welcome-final-cta-content > p',
    ].join(', ')).forEach((target) => observer.observe(target))
    observer.observe(pageRef.current.querySelector('.welcome-daybook'))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="welcome-page" ref={pageRef}>
      <a className="welcome-skip" href="#welcome-content">Skip to content</a>
      <header className="welcome-header">
        <a className="brand welcome-brand" href="#top" aria-label="Wholeturn home">
          <BrandMark />
          <span className="brand-name">
            <strong>Wholeturn</strong>
          </span>
        </a>
        <button className="button welcome-sign-in" type="button" data-auth-trigger="header" onClick={() => onSignIn('header')}>
          Sign in
        </button>
      </header>

      <main id="welcome-content">
        <section className="welcome-hero" id="top" aria-labelledby="welcome-title">
          <img className="welcome-hero-photo" src={heroPhoto} alt="" aria-hidden="true" fetchPriority="high" />
          <div className="welcome-hero-layout">
            <div className="welcome-hero-copy">
              <h1 id="welcome-title" aria-label="Track the roles in your day.">
                <span>Track the roles</span>
                <span>in your day.</span>
              </h1>
              <p className="welcome-lede">
                Keep a personal record of time across study, freelance work, family, and rest. At each switch, note your energy and what you want to focus on next.
              </p>
              <div className="welcome-actions">
                <button className="button button-primary welcome-primary-action" type="button" data-auth-trigger="hero" onClick={() => onCreateAccount('hero')}>
                  Create your account
                </button>
                <button className="button welcome-secondary-action" type="button" onClick={onExploreDemo}>
                  Explore the sample day
                </button>
              </div>
              <p className="welcome-action-note">You can try a fictional sample day before signing up. Nothing is saved.</p>
            </div>
            <SampleTransition />
          </div>
        </section>

        <section className="welcome-how" id="how-it-works" aria-labelledby="how-title">
          <div className="welcome-how-layout">
            <div className="welcome-section-intro">
              <h2 id="how-title">How Wholeturn works.</h2>
              <p>Follow one day from its first role to the moment you look back.</p>
              <p className="welcome-how-sample-note">A fictional example</p>
            </div>
            <ol className="welcome-daybook">
              <li>
                <time dateTime="08:30">8:30 AM</time>
                <div className="welcome-daybook-entry">
                  <h3>Start Designer</h3>
                  <p>Give this part of your day a clear beginning.</p>
                  <dl className="welcome-daybook-detail" data-ui>
                    <dt>Current role</dt>
                    <dd>Designer</dd>
                  </dl>
                </div>
              </li>
              <li>
                <time dateTime="12:30">12:30 PM</time>
                <div className="welcome-daybook-entry">
                  <h3 aria-label="Handoff from Designer to Caregiver">Designer <span aria-hidden="true">→</span> Caregiver</h3>
                  <p>The handoff keeps your time, energy, and next intention together.</p>
                  <dl className="welcome-daybook-detail welcome-daybook-switch" data-ui>
                    <div><dt>Designer</dt><dd>4h</dd></div>
                    <div><dt>Energy</dt><dd aria-label="3 to 2">3 <span aria-hidden="true">→</span> 2</dd></div>
                    <div><dt>Focus intention</dt><dd>Be present this afternoon</dd></div>
                  </dl>
                </div>
              </li>
              <li>
                <time dateTime="17:00">5:00 PM</time>
                <div className="welcome-daybook-entry">
                  <h3>Review the day</h3>
                  <p>See how the roles fit together, without turning the day into a score.</p>
                  <dl className="welcome-daybook-detail welcome-daybook-totals" data-ui>
                    <div><dt>Designer</dt><dd>4h</dd></div>
                    <div><dt>Caregiver</dt><dd>4h 30m</dd></div>
                    <div><dt>Total</dt><dd>8h 30m</dd></div>
                  </dl>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="welcome-trust" aria-labelledby="trust-title">
          <div className="welcome-trust-intro">
            <h2 id="trust-title">Your day, in your own words.</h2>
            <p>Look through a sample day before creating one of your own. The app leaves its meaning and next step to you.</p>
            <button className="button welcome-trust-action" type="button" onClick={onExploreDemo}>
              Try the sample day
            </button>
          </div>
          <div className="welcome-trust-evidence">
            <div className="welcome-trust-evidence-heading">
              <span>What you can see</span>
              <span>Sample / personal</span>
            </div>
            <div className="welcome-trust-evidence-row">
              <h3>A sample you can open</h3>
              <p>Start a role, record a switch, and review a fictional sample day without an account. Nothing is saved.</p>
            </div>
            <div className="welcome-trust-evidence-row">
              <h3>What a switch records</h3>
              <p>The roles and switch time, energy before and after, your focus intention, and any values or boundary note you add.</p>
            </div>
            <div className="welcome-trust-evidence-row">
              <h3>Separate by design</h3>
              <p>Your sample changes are temporary and reset when you leave; they never open account data. Personal record storage is still being set up.</p>
            </div>
          </div>
        </section>

        <section className="welcome-faq" aria-labelledby="faq-title">
          <div className="welcome-faq-intro">
            <h2 id="faq-title">Questions before you begin.</h2>
            <p>What stays a sample, what becomes your record, and what happens when time passes.</p>
          </div>
          <dl className="welcome-faq-list">
            <div>
              <dt>Can I try the demo without an account?</dt>
              <dd>Yes. Start a role, record a switch, and review a fictional sample day without signing in. Nothing is saved.</dd>
            </div>
            <div>
              <dt>What gets recorded when I switch roles?</dt>
              <dd>The form captures the next role, energy before and after, a focus intention, and any values or boundary note you add. Once personal storage is ready, saving a switch will end the current session and start the next.</dd>
            </div>
            <div>
              <dt>What happens when I return after time away?</dt>
              <dd>If a session is still active, you review its start time and elapsed time. You can correct the start before returning to your workspace, even if the session spans midnight.</dd>
            </div>
            <div>
              <dt>What information is stored?</dt>
              <dd>Your email and password are used for sign-in. The demo saves no entries. Personal record storage is not set up yet; it is intended to hold your roles, values, session times, and switch details.</dd>
            </div>
          </dl>
        </section>

        <section className="welcome-final-cta" aria-labelledby="final-cta-title">
          <div className="welcome-final-cta-content">
            <h2 id="final-cta-title">Give each part of your day a place.</h2>
            <p>Start with the roles that matter in your life right now.</p>
            <button className="button button-primary welcome-primary-action" type="button" data-auth-trigger="footer" onClick={() => onCreateAccount('footer')}>
              Create your account
            </button>
          </div>
        </section>
      </main>

      <footer className="welcome-footer">
        <span>Wholeturn</span>
        <span>Private reflection, in your own words.</span>
      </footer>
    </div>
  )
}
