<p align="center">
  <a href="https://dittofeed.com">
    <picture>
      <img width="350" alt="dittofeed logo" src="https://raw.githubusercontent.com/dittofeed/dittofeed/main/packages/docs/logo/light.png">
    </picture>
  </a>
</p>

---

## Open-source customer engagement

[Dittofeed](https://dittofeed.com) is an omni-channel customer engagement platform. Create automated user journeys to message users along any channel: email, mobile push notifications, SMS, custom webhooks, Slack, and more. We're an open source, dev-friendly alternative to platforms like OneSignal, Customer.io, and Segment Engage.

<br>

[![Dittofeed Docs Badge](https://img.shields.io/badge/docs-dittofeed-1?color=%2349BBD4&link=https%3A%2F%2Fdocs.dittofeed.com%2Fintroduction)](https://docs.dittofeed.com/introduction)
[![Dittofeed Live Demo Badge](https://img.shields.io/badge/live_demo-dittofeed-1?color=%2349BBD4&link=https%3A%2F%2Fdemo.dittofeed.com%2Fdashboard%2Fjourneys)](https://demo.dittofeed.com/dashboard/journeys/)
[![Dittofeed Site Badge](https://img.shields.io/badge/site-dittofeed-1?color=%2349BBD4&link=https%3A%2F%2Fdittofeed.com%2F)](https://dittofeed.com/)
[![Dittofeed Open-source Contributing Badge](https://img.shields.io/badge/contributing-dittofeed?color=%2349BBD4&link=https%3A%2F%2Fdocs.dittofeed.com%2Fcontributing%2Frunning-locally)](https://docs.dittofeed.com/contributing/running-locally)
[![Dittofeed Discord Community Badge](https://img.shields.io/discord/1182801141046726706?style=social&logo=discord&label=Community&link=https%3A%2F%2Fdiscord.gg%2FHajPkCG4Mm
)](https://discord.gg/HajPkCG4Mm)
[![Dittofeed X Twitter Social Badge](https://img.shields.io/badge/follow-dittofeed?style=social&logo=x&link=https%3A%2F%2Fx.com%2Fdittofeed)](https://x.com/dittofeed)

<br>

- 1️⃣ Connect user data via Segment, Reverse ETL, or the Dittofeed API ⛓️
- 2️⃣ Create highly customizable user segments with multiple operators 🧍🏽‍♀️🧍🏻‍♂️🧍🏾
- 3️⃣ Design messaging templates using HTML, MJML, or Markdown 👨🏻‍🎨
- 4️⃣ Automate user journeys with a powerful, easy-to-use GUI interface 🛩️
- 5️⃣ Integrate with major ESPs like Sendgrid and Amazon SES 🏰
- 6️⃣ Track and analyze message performance from the dashboard 🎯

<br>

<a href="https://dittofeed.com/">
  <img src="packages/docs/images/github-readme-banner.png" alt="Dittofeed Admin Panel Banner" />
</a>

<br>

### Dashboard Views

<details>
  <summary><b>Journey Builder</b></summary>
  <img alt="Customer Journeys" src="packages/docs/images/journeys_github.png">
</details>
<details>
  <summary><b>Segmentation</b></summary>
  <img alt="User Segmentation" src="packages/docs/images/segments_github.png">
</details>
<details>
  <summary><b>Template Editor</b></summary>
  <img alt="Messaging Templates" src="packages/docs/images/templates_github.png">
</details>

### Architecture

<details>
  <summary><b>Visual Diagram</b></summary>
  <img alt="Architecture" src="packages/docs/images/architecture-readme.png">
</details>

For the full dashboard experience, play around with the [demo app](https://demo.dittofeed.com/dashboard).

## Quick Deployment

Click Deploy to Render below and follow the prompts to deploy Dittofeed on Render. See the "Self-Host with Render" [docs for more info](https://docs.dittofeed.com/deployment/self-hosted/render).

<a href="https://render.com/deploy?repo=https://github.com/dittofeed/dittofeed" target="_blank" rel="nofollow"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy To Render"></a>

## Roadmap

*Updated monthly | ☑️ = in development | ✅ = in production

| Feature                         | Purpose                                                                                              | Status |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| SMTP support                    | Use SMTP as an email provider                                                                        | ✅      |
| SES support                     | Use Amazon SES as an email provider                                                                  | ☑️      |
| User property objects & arrays  | Store objects & arrays within user properties                                                        | ✅      |
| Segment node type               | Expose segments as a node type within the journeys GUI                                               | ☑️      |
| Incrimental computed properties | Rearchitect computed properties engine to incrementally recompute properties for greater scalability | ✅      |
| Reverse ETL                     | Add support for reverse ETL as a data source via Polytomic                                           | ✅      |
| Twilio SMS support              | Use Twilio as a SMS provider                                                                         | ✅      |
| Broadcast UI                    | Improve functionality and usability of Broadcasts                                                    | ✅      |


## Developer-centric

Beyond having industry-standard GUI tools, we focus on developer happiness with first-in-class dev-focused features:

- Branch-based git worflows that support marketing campaign version control.
- Write email templates in your favorite editor, checked into git - not in an unversioned web based IDE.
- Testing SDK to test your marketing campaigns in CI. No more manually QAing them in production.
- Self-hostable. Protect your sensitive PII inside of your own VPC. Avoid volume-based pricing.
- Journey monitoring and alerting.

More to come...

## Support

If you're interested in trying us out, please get in touch!

* [Discord community](https://discord.gg/HajPkCG4Mm)
* [Email support](mailto:support@dittofeed.com)
* [Open an issue](https://github.com/dittofeed/dittofeed/issues/new)
* [Book a meeting](https://calendly.com/d/zy7-8d5-jdq/dittofeed-demo-founders)

## Contributing

For instructions on how to run Dittofeed locally and contribute to this project, see Dittofeed's [contributing docs](https://docs.dittofeed.com/contributing/).

## License

[MIT licensed](/LICENSE), and free forever.
