"""Storylines for the papersbytrey promo videos.

Each beat is one line of narration. `say` is what the voice reads, `cap` (optional)
is what the captions show when it should differ (e.g. "2026" vs "twenty twenty-six").
`shot` picks a camera move from scene.js; consecutive beats with the same shot are one
continuous move unless `cut` is set. `state` toggles props, `card` shows the white
question/maths card, `mascot` places the little paper character.
"""

F = lambda a, b: {"f": [a, b]}  # fraction token for maths cards
Q_PARAS = [
    "A bag contains 3 red counters and some blue counters.",
    "Two counters are taken at random without replacement.",
    "The probability that both are red is 1/7.",
    "Work out how many counters are in the bag.",
]
EQ = [F("3", "n"), "×", F("2", "n − 1"), "=", F("1", "7")]
CTA_SET = "I've got the full set. Comment twenty twenty-six, and I'll send them over."
CTA_SET_CAP = "I've got the full set. Comment 2026 and I'll send them over."
M_R = {"x": 860, "y": 1640, "s": 0.85}
M_L = {"x": 220, "y": 1640, "s": 0.85}

VIDEOS = {
    "01-turn-the-page": {
        "hook": "POV: you turn the page",
        "paper": {"qnum": "14", "lines": Q_PARAS},
        "beats": [
            {"say": "Picture turning over your maths paper, and seeing this.", "shot": "hallWide"},
            {"say": "A bag has three red counters, and some blue ones. Two come out, without replacement.",
             "cap": "A bag has 3 red counters and some blue ones. Two come out, without replacement.",
             "shot": "deskPOV", "state": {"flip": "beat"},
             "card": {"id": "q", "type": "text", "paras": Q_PARAS, "highlight": 1}},
            {"say": "The chance they're both red is one seventh. So how many counters are in the bag?",
             "cap": "The chance they're both red is 1/7. So how many counters are in the bag?",
             "shot": "deskTop", "state": {"flip": "up"},
             "card": {"id": "q", "type": "text", "paras": Q_PARAS, "highlight": 2}},
            {"say": "It looks like probability. But it's secretly algebra.", "shot": "orbit",
             "state": {"flip": "up"}, "mascot": {**M_R, "mood": "shock"}},
            {"say": "Call the total n. The first counter is red with probability three over n.",
             "cap": "Call the total n. The first counter is red with probability 3 over n.",
             "shot": "deskTop", "state": {"flip": "up"},
             "card": {"id": "m", "type": "math", "rows": [[F("3", "n")]]}},
            {"say": "Now there's one fewer counter, and one fewer red. So two over n minus one.",
             "cap": "Now there's one fewer counter, and one fewer red. So 2 over n minus 1.",
             "shot": "deskTop", "state": {"flip": "up"},
             "card": {"id": "m", "type": "math", "rows": [[F("3", "n")], [F("2", "n − 1")]]}},
            {"say": "Multiply them, and set it equal to one seventh.", "cap": "Multiply them, and set it equal to 1/7.",
             "shot": "orbit", "cut": True, "state": {"flip": "up"},
             "card": {"id": "m", "type": "math", "rows": [[F("3", "n")], [F("2", "n − 1")], EQ]}},
            {"say": "Cross multiply, and you get n squared, minus n, minus forty two, equals zero.",
             "cap": "Cross multiply, and you get a quadratic equal to zero.",
             "shot": "orbit", "state": {"flip": "up"},
             "card": {"id": "m", "type": "math", "rows": [EQ, ["n(n − 1) = 42"], ["n² − n − 42 = 0"]]}},
            {"say": "Factorise it. n minus seven, times n plus six.", "cap": "Factorise it. n minus 7, times n plus 6.",
             "shot": "deskTop", "cut": True, "state": {"flip": "up"},
             "card": {"id": "m", "type": "math", "rows": [EQ, ["n(n − 1) = 42"], ["n² − n − 42 = 0"], ["(n − 7)(n + 6) = 0"]]}},
            {"say": "So there are seven counters. Because you can't have minus six.",
             "cap": "So there are 7 counters. Because you can't have minus 6.",
             "shot": "deskTop", "state": {"flip": "up"}, "mascot": {**M_R, "mood": "happy"},
             "card": {"id": "m", "type": "math", "rows": [["n² − n − 42 = 0"], ["(n − 7)(n + 6) = 0"], ["n = 7"]]}},
            {"say": "Questions like this don't come out of nowhere. The same tricks keep turning up, year after year.",
             "shot": "invig"},
            {"say": "And the newest versions are on the twenty twenty-six papers.",
             "cap": "And the newest versions are on the 2026 papers.", "shot": "hallHigh"},
            {"say": CTA_SET, "cap": CTA_SET_CAP, "shot": "end"},
        ],
    },
    "02-same-hours": {
        "hook": "Same revision hours. Different grades.",
        "grade": 8,
        "beats": [
            {"say": "Two students revise for exactly the same number of hours.", "shot": "hallWide"},
            {"say": "Student one rewatches videos, rewrites notes, and highlights everything.",
             "shot": "notesDesk", "state": {"notes": True, "papers": True, "hide": [61]}},
            {"say": "It feels productive. It looks productive.", "shot": "notesDesk",
             "state": {"notes": True, "papers": True, "hide": [61]}, "mascot": {**M_L, "mood": "happy"}},
            {"say": "Student two sets a timer, sits a real paper, marks it. Then does another one.",
             "shot": "papersDesk", "state": {"notes": True, "papers": True, "hide": [61]}},
            {"say": "Same hours. Completely different kind of practice.", "shot": "twoDesk",
             "state": {"notes": True, "papers": True, "hide": [61]}},
            {"say": "Exam day. The clock starts.", "shot": "clock"},
            {"say": "Student one is seeing these questions for the very first time.", "shot": "deskPOV",
             "state": {"flip": "beat"}, "mascot": {**M_R, "mood": "shock"}},
            {"say": "Student two has seen this style before. The wording. The traps. The timing.", "shot": "invig"},
            {"say": "Results day. Same hours. Very different envelopes.", "shot": "envelope",
             "state": {"envelope": "beat"}},
            {"say": "The difference wasn't how long they revised. It was what they revised with.", "shot": "hallHigh"},
            {"say": "And the closest thing to your real exam, is the most recent one. The twenty twenty-six papers.",
             "cap": "And the closest thing to your real exam is the most recent one. The 2026 papers.",
             "shot": "papersDesk", "state": {"notes": True, "papers": True, "hide": [61]}},
            {"say": "Want the full set? Comment twenty twenty-six, and I'll send them over.",
             "cap": "Want the full set? Comment 2026 and I'll send them over.", "shot": "end"},
        ],
    },
    "03-3am": {
        "hook": "It's 3:07am and you've done everything…",
        "beats": [
            {"say": "It's three a.m. You've finished the textbook. You've done every single worksheet.",
             "cap": "It's 3am. You've finished the textbook. You've done every single worksheet.",
             "shot": "nightDesk", "mode": "night"},
            {"say": "But there's one thing sitting on almost nobody's desk.", "shot": "nightDesk",
             "mode": "night", "mascot": {**M_R, "mood": "shock"}},
            {"say": "The twenty twenty-six papers. The newest exams, from the same exam boards setting yours.",
             "cap": "The 2026 papers. The newest exams, from the same exam boards setting yours.",
             "shot": "emptyWide", "mode": "dawn"},
            {"say": "Every board has habits. Favourite topics. Favourite tricks.", "shot": "deskTop",
             "mode": "night", "state": {"flip": "up"},
             "card": {"id": "h", "type": "list", "title": "EVERY BOARD HAS HABITS",
                      "items": ["Favourite topics", "Favourite tricks", "Favourite ways to word a question"], "shown": 2}},
            {"say": "Favourite ways to word a question, so you second guess yourself.", "shot": "deskTop",
             "mode": "night", "state": {"flip": "up"},
             "card": {"id": "h", "type": "list", "title": "EVERY BOARD HAS HABITS",
                      "items": ["Favourite topics", "Favourite tricks", "Favourite ways to word a question"], "shown": 3}},
            {"say": "And the newest paper shows you those habits as they are now. Not five years ago.", "shot": "invig"},
            {"say": "So when the clock starts, it doesn't feel like a surprise.", "shot": "clock"},
            {"say": "It feels like a rerun.", "shot": "hallWide", "mascot": {**M_R, "mood": "happy"}},
            {"say": "I've got them. Comment twenty twenty-six, and they're yours.",
             "cap": "I've got them. Comment 2026 and they're yours.", "shot": "end"},
        ],
    },
    "04-the-pattern": {
        "hook": "Line up every past paper and something weird happens…",
        "beats": [
            {"say": "Put every past paper side by side, and something strange happens.", "shot": "board",
             "mode": "night", "state": {"board": True}},
            {"say": "The same kinds of questions keep coming back. Different numbers. Different story. Same skill.",
             "shot": "board", "mode": "night", "state": {"board": True}, "mascot": {**M_R, "mood": "shock"}},
            {"say": "The probability question that's secretly algebra.", "shot": "deskTop", "state": {"flip": "up"},
             "card": {"id": "k", "type": "list", "title": "KEEPS COMING BACK",
                      "items": ["Probability that's secretly algebra", "A “show that” hiding a quadratic",
                                "A six-marker that wants the same key points"], "shown": 1}},
            {"say": "The show that, hiding a quadratic.", "cap": "The “show that” hiding a quadratic.",
             "shot": "deskTop", "state": {"flip": "up"},
             "card": {"id": "k", "type": "list", "title": "KEEPS COMING BACK",
                      "items": ["Probability that's secretly algebra", "A “show that” hiding a quadratic",
                                "A six-marker that wants the same key points"], "shown": 2}},
            {"say": "The six marker that wants the same key points, every time.", "shot": "deskTop",
             "state": {"flip": "up"},
             "card": {"id": "k", "type": "list", "title": "KEEPS COMING BACK",
                      "items": ["Probability that's secretly algebra", "A “show that” hiding a quadratic",
                                "A six-marker that wants the same key points"], "shown": 3}},
            {"say": "Once you see the pattern, you can't unsee it. Questions stop looking scary. They start looking familiar.",
             "shot": "orbit", "state": {"flip": "up"}, "mascot": {**M_L, "mood": "happy"}},
            {"say": "And the newest piece of the puzzle?", "shot": "board", "mode": "night", "state": {"board": True}},
            {"say": "The twenty twenty-six papers.", "cap": "The 2026 papers.", "shot": "hallWide"},
            {"say": CTA_SET, "cap": CTA_SET_CAP, "shot": "end"},
        ],
    },
    "05-mock-season": {
        "hook": "Mocks are weeks away. Watch this.",
        "grade": 7,
        "beats": [
            {"say": "Mock season is coming. And most people will walk in having never sat a full paper, under timed conditions.",
             "shot": "emptyWide", "mode": "dawn"},
            {"say": "Ninety minutes. No notes. No pausing the video.", "cap": "90 minutes. No notes. No pausing the video.",
             "shot": "clock"},
            {"say": "That's a completely different skill to revising.", "shot": "aisle", "mascot": {**M_R, "mood": "shock"}},
            {"say": "The only way to train it, is to practise the real thing.", "shot": "papersDesk",
             "state": {"papers": True, "hide": [61]}},
            {"say": "And the most realistic practice there is? The most recent exam.", "shot": "deskPOV",
             "state": {"flip": "beat"}},
            {"say": "The twenty twenty-six papers show you what the exam looks like right now. The layout. The difficulty. The curveballs.",
             "cap": "The 2026 papers show you what the exam looks like right now. The layout. The difficulty. The curveballs.",
             "shot": "invig"},
            {"say": "Do them now, and your mock results become a warm up. Not a wake up call.",
             "cap": "Do them now, and your mock results become a warm-up. Not a wake-up call.",
             "shot": "envelope", "state": {"envelope": "beat"}, "mascot": {**M_L, "mood": "happy"}},
            {"say": "Comment twenty twenty-six, and I'll send you the full set.",
             "cap": "Comment 2026 and I'll send you the full set.", "shot": "end"},
        ],
    },
}


# Photo (from photos/<name>.jpg) behind each beat, in order.
PHOTOS = {
    "01-turn-the-page": ["hall", "desk", "paper", "stressed", "paper", "paper", "desk", "desk", "paper", "paper", "invig", "stack", None],
    "02-same-hours": ["hall", "notes", "notes", "timed", "empty", "clock", "stressed", "invig", "results", "celebrate", "stack", None],
    "03-3am": ["night", "night", "empty", "paper", "paper", "invig", "clock", "hall", None],
    "04-the-pattern": ["board", "board", "paper", "paper", "paper", "timed", "board", "stack", None],
    "05-mock-season": ["empty", "clock", "stressed", "timed", "desk", "invig", "celebrate", None],
}
for _name, _imgs in PHOTOS.items():
    assert len(_imgs) == len(VIDEOS[_name]["beats"]), _name
    for _b, _img in zip(VIDEOS[_name]["beats"], _imgs):
        if _img:
            _b["img"] = _img
