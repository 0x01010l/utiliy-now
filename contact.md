---
layout: page
title: Contact
permalink: /contact/
description: Send a question, correction, or article request. I read every message.
---

The fastest way to reach me is the form below. I don't have comments enabled on articles yet — too much spam to moderate while working a full-time job — so this is the best channel.

<form class="contact-form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
  <label for="name">Name</label>
  <input type="text" id="name" name="name" required autocomplete="name">

  <label for="email">Email</label>
  <input type="email" id="email" name="_replyto" required autocomplete="email">

  <label for="topic">Topic</label>
  <input type="text" id="topic" name="topic" placeholder="e.g. Pi-hole blocking Netflix">

  <label for="message">Message</label>
  <textarea id="message" name="message" rows="7" required></textarea>

  <button type="submit">Send message</button>
</form>

<p style="margin-top:2rem;color:#44403c;font-family:'Source Sans 3',sans-serif;font-size:0.95rem;">
  Prefer email directly? <a href="mailto:hello@utiliy.com">hello@utiliy.com</a><br>
  I usually reply within 48 hours. Include router model and OS version for troubleshooting — it saves three emails back and forth.
</p>

<style>
.contact-form label {
  display: block;
  font-family: "Source Sans 3", sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 0.35rem;
}
.contact-form input,
.contact-form textarea {
  width: 100%;
  max-width: 36rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid #e7e0d5;
  border-radius: 0.6rem;
  font-family: "Source Sans 3", sans-serif;
  font-size: 1rem;
  margin-bottom: 1rem;
  background: #fffcf8;
}
.contact-form button {
  background: #c2410c;
  color: #fff;
  border: none;
  padding: 0.75rem 1.4rem;
  border-radius: 999px;
  font-family: "Source Sans 3", sans-serif;
  font-weight: 600;
  cursor: pointer;
}
.contact-form button:hover { background: #9a3412; }
</style>

> Replace `YOUR_FORM_ID` with your Formspree endpoint after signing up at [formspree.io](https://formspree.io).
