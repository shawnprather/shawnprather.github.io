# Decision log

Your methods section. About one page total.

Answer these as you go, not the night before it is due.
Specifics beat polish - a short honest answer is worth more than a long vague one.

Delete these instructions when you are done, or leave them. It does not matter.

---

## 1. What did you set out to build, and what changed?

What you wanted at the start, and what is actually live now.
Name one thing you dropped or added along the way, and why.

I set out to build a cool website that had my info but more importantly was fun to mess around with. I think I acomplished what I set out to build pretty well but the scope changed drastically. Initally, the plan was just having object you could throw and turn to sand. The scope massively increased due to both me and claude thinking of new interesting ideas that would be fun to add. A specific thing is we added a browser inside of the browser because I thought it was funny which it is.

---

## 2. A fork in the road

Name one real choice where you could have gone two ways.
Plain HTML or a framework. One page or several. Your own CSS or someone's template.
What goes on the front page and what does not.

Say which you picked, what the alternative was, and what you gave up by not taking it.

"There was no alternative" is not an answer. Find the fork.

So for the physics on my site I picked Matter.js for basiclly everything minus the sand since it was too complex for it. This I think turned out pretty good since the alternative would have been either a more complicated physics engine or doing it by hand. But by using the "simple" option I lost a lot of the customization and had to rely a lot more on the supporting package having the features I wanted. This actual did cost the project since sand was too complicated for it so it had to get wrote by hand.

---

## 3. Where you overruled the agent

One time Claude suggested, wrote, or claimed something and you did not take it.

What did it do? How did you notice? What did you do instead?

If it genuinely never happened, say so plainly, and then say what you would have had to
check in order to notice. Being honest here costs you far less than a story you cannot
defend when you record your video.

Yea so when adding some of the achievements me and claude disagreed on how to actually implement them. I think one big thing was the more depth a site has in terms of embedded stuff the less claude is able to effectivley look at it and test it. So for the achievements it had a poor idea of how to implement the multi layered browser achivement mainly from it not knowing what it looked like. Additionally, a lot of the physics testing stuff had to be done by me since doing all of the like object dragging and stuff is slightly too complicated for claude.

---

## 4. How you know it works

What check did you run, and what did it tell you?

Then the real question: **what would have made this check fail?**
A check that could not have failed is not a check.

Link to your `verification/` folder.

I ran curl on the site, and I also can reach the page. Then also claude did a bunch of testing to make nothing was amiss specifcally with working on mac since there was some mac issues I encountered. The tests told me that the site was alive and displayed the html/css/js, and that at least the primary physics stuff was working. Stuff that would have made the checks fail is if the curl didn't return 200, if I couldn't reach the page, or if the physics was broken.

---

## 5. What is still wrong

One thing on your own site that is not right, not finished, or that you do not
fully understand.

What would you do next, and how would you find out?

The "Sand Planets" physics mode is still kinda broken since it was meant to simulate the sand as basically mass bodies but that is quite difficult when they are particles. I was able to get it a lot closer to the desired implementation but there is still the bug of the "Planets" stopping movement and then everything just gets stuck. I think to get it working I would need to do a bunch of planning and research about how to simulate gravity, rotation, and friction on particles since it is a pretty hard problem.
