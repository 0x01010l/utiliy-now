---
layout: page
title: Contact
permalink: /contact/
description: Send a question, correction, or article request.
---

Use the form below. I don't have comments on articles — too much spam to moderate next to a full-time job.

<form class="contact-form" action="https://formsubmit.co/hello@utiliy.com" method="POST">
  <input type="hidden" name="_subject" value="Utiliy contact form">
  <input type="hidden" name="_next" value="https://utiliy.com/thanks/">
  <input type="hidden" name="_template" value="table">
  <input type="text" name="_honey" class="hp-field" tabindex="-1" autocomplete="off">

  <label for="name">Name</label>
  <input type="text" id="name" name="name" required autocomplete="name">

  <label for="email">Email</label>
  <input type="email" id="email" name="email" required autocomplete="email">

  <label for="topic">Topic</label>
  <input type="text" id="topic" name="topic" placeholder="e.g. Pi-hole blocking Netflix">

  <label for="message">Message</label>
  <textarea id="message" name="message" rows="7" required></textarea>

  <button type="submit">Send message</button>
</form>

<p class="contact-note">
  Or email <a href="mailto:hello@utiliy.com">hello@utiliy.com</a>.
  Include router model and OS version for troubleshooting — it saves three emails.
</p>
