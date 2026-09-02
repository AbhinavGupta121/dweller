/**
 * Beats for Tercentenary Theatre and the buildings that define it: Widener,
 * Memorial Church, Sever, Emerson.
 */

const WIDENER = "https://en.wikipedia.org/wiki/Widener_Library";
const MEMCH =
  "https://en.wikipedia.org/wiki/Memorial_Church_of_Harvard_University";
const SEVER = "https://en.wikipedia.org/wiki/Sever_Hall";
const YARD = "https://en.wikipedia.org/wiki/Harvard_Yard";

export const beats = [
  /* ------------------------------------------ Tercentenary Theatre --- */
  {
    id: "tercentenary-arrival",
    subject: "tercentenary-theatre",
    angle: "architecture",
    depth: 1,
    arrival: true,
    tags: ["architecture", "history"],
    look: "the four buildings framing this lawn",
    text: `Stop here for a second and turn around slowly. This lawn is called
      Tercentenary Theatre, and it is a room. Widener on one side, Memorial
      Church opposite, University Hall and Sever on the ends. Four buildings, no
      walls.`,
    sources: [YARD, MEMCH],
  },
  {
    id: "tercentenary-accident",
    subject: "tercentenary-theatre",
    angle: "architecture",
    depth: 2,
    requires: ["tercentenary-arrival"],
    tags: ["architecture", "urbanism"],
    text: `This space was not master planned. It was produced almost as a side
      effect. Widener went up in nineteen fifteen and dominated everything. When
      Harvard came to replace the old Appleton Chapel in nineteen thirty-two,
      the architects were explicitly told to design something that would
      complement Widener. Putting a monumental church directly opposite a
      monumental library is what closed the fourth side, and the lawn between
      them became the ceremonial heart of the university. The room is what was
      left over.`,
    sources: [MEMCH, YARD],
  },
  {
    id: "tercentenary-commencement",
    subject: "tercentenary-theatre",
    angle: "present",
    depth: 2,
    tags: ["present", "ritual"],
    text: `This is where Commencement happens. Every year the chairs go out on
      this grass and the whole university funnels into this rectangle. The Yard
      as a whole is twenty-two and a half acres, but this is the piece that has
      to hold everyone at once, which is why it stays stubbornly empty the rest
      of the time. An expensive amount of nothing, kept clear on purpose.`,
    sources: [YARD],
  },

  /* ---------------------------------------------------- Widener --- */
  {
    id: "widener-arrival",
    subject: "widener-library",
    angle: "history",
    depth: 1,
    arrival: true,
    tags: ["history", "architecture"],
    look: "the scale of the steps and the columns",
    text: `Widener Library. Three and a half million books, and it exists
      because a twenty-seven year old book collector drowned when the Titanic
      went down.`,
    sources: [WIDENER],
  },
  {
    id: "widener-titanic",
    subject: "widener-library",
    angle: "people",
    depth: 2,
    requires: ["widener-arrival"],
    tags: ["people", "history"],
    text: `Harry Elkins Widener, Harvard class of nineteen oh seven, died on
      the fifteenth of April, nineteen twelve. His father died too. His mother,
      Eleanor Elkins Widener, survived. Harry's will said his book collection
      should go to Harvard once the university could properly care for it, and
      he had told a friend shortly before he died that he wanted to be
      remembered in connection with a great library, but could not see how it
      would come about. His mother made it come about.`,
    sources: [WIDENER],
  },
  {
    id: "widener-gore",
    subject: "widener-library",
    angle: "history",
    depth: 2,
    tags: ["history", "books", "failure"],
    text: `What she was replacing was a disaster. The old library, Gore Hall,
      was declared full in eighteen sixty-three. By nineteen ten a committee of
      architects wrote that it was unsafe, hopelessly overcrowded, leaks when
      there is a heavy rain, intolerably hot in summer, with books left lying on
      top of one another or actually on the floor. The university librarian
      reported that the light switches were giving his staff electric shocks.
      Harvard had five hundred and forty-three thousand books and was storing
      the overflow in dormitory basements.`,
    sources: [WIDENER],
  },
  {
    id: "widener-abele",
    subject: "widener-library",
    angle: "architecture",
    depth: 3,
    tags: ["architecture", "people", "race"],
    look: "the Corinthian capitals and the limestone tracery",
    text: `Now the architecture, which has a story most plaques skip. Eleanor
      Widener attached conditions to the gift, and one of them was that the
      architects had to be Horace Trumbauer's firm, who had built mansions for
      her family. Harvard's president wrote privately that she does not give the
      University the money to build a new library, but has offered to build a
      library satisfactory in external appearance to herself, and noted that she
      has decided architectural opinions. Harvard gave Trumbauer an honorary
      degree on dedication day. But the person who actually had overall
      responsibility for the design was Trumbauer's associate Julian Abele,
      the chief designer in the office and one of the first formally trained
      Black architects in America. He drew this building, and Duke's campus, and
      for decades got very little public credit for either. What you are looking
      at is Harvard brick with Indiana limestone tracery, two hundred and fifty
      feet by two hundred, eighty feet high, colonnaded with Corinthian
      capitals, at the head of a flight of stairs one writer said would not
      disgrace the Capitol in Washington. Eleanor Widener expected to spend two
      million dollars. It probably came to over three and a half million, which
      is something like eighty million today, and Harvard never knew the real
      figure because she treated the finances as her private business.`,
    sources: [WIDENER],
  },
  {
    id: "widener-stacks",
    subject: "widener-library",
    angle: "science",
    depth: 3,
    tags: ["books", "tech", "systems"],
    text: `The inside is a genuinely strange machine. Fifty-seven miles of
      shelving, along five miles of aisles, on ten levels, in three wings. One
      student wrote that she could not enter without feeling that she ought to
      carry a compass, a sandwich, and a whistle. For most of its life the
      stacks had almost no signage, and a library official explained the
      reasoning: there was the expectation that if you were good enough to
      qualify to get into the stacks you certainly didn't need any help. At times
      they have painted colour-coded lines and shoeprints on the floors so people
      could keep their bearings. Two other things make it hard. First, Widener
      ran its own idiosyncratic classification system, where the Austro-Hungarian
      Empire gets a class and so does the Ottoman Empire, and Dante and Molière
      and Montaigne each get one to themselves. In the nineteen seventies new
      books started arriving under Library of Congress numbers instead, and
      reclassifying millions of volumes was impossible, so books on the same
      subject now sit in two unrelated places depending on when they arrived.
      Second, an accident of the building's layout produced two separate card
      catalogues on different floors with a relationship that perplexed students
      and faculty alike, and it took until the nineteen nineties for a computer
      to finally replace both. Widener is also the only one of the world's five
      megalibraries that lets ordinary readers walk into the general stacks and
      browse.`,
    sources: [WIDENER],
  },
  {
    id: "widener-swim-myth",
    subject: "widener-library",
    angle: "mythbust",
    depth: 2,
    tags: ["myth"],
    text: `You will probably be told that Eleanor Widener made Harvard require
      every student to learn to swim, so no one would drown like her son.
      Harvard's own librarians call this the most prevalent of all the Widener
      myths, and a university historian wrote that there is absolutely no
      evidence for it. Harvard has had swimming tests at various times, for
      rowers and once for entering first-years, but not because of the Titanic.
      The related claim that she endowed perpetual ice cream in the dining halls
      is also made up.`,
    sources: [WIDENER],
  },
  {
    id: "widener-gutenberg",
    subject: "widener-library",
    angle: "history",
    depth: 3,
    tags: ["crime", "books", "history"],
    text: `Somewhere in the middle of this building are the Widener Memorial
      Rooms, holding Harry's own rare books, and one of only thirty-eight
      perfect copies of the Gutenberg Bible in existence. His grandfather bought
      it while Harry was abroad, intending to surprise him when the Titanic
      docked in New York. The family added it to the collection in nineteen
      forty-four. On the night of the nineteenth of August, nineteen sixty-nine,
      a twenty year old man decided to steal it. He hid in a lavatory until the
      library closed, got up to the roof, and lowered himself on a knotted rope
      through a Memorial Room window. He smashed the display case, put both
      volumes in a knapsack, and then discovered that seventy extra pounds made
      it impossible to climb back up the rope. He fell about fifty feet into one
      of the light courts and lay there with a fractured skull until a janitor
      heard him moaning around one in the morning. The Harvard police chief said
      it looks like a professional job all right, in the fact that he came down
      the rope, but it doesn't look very professional that he fell off. The
      Bible survived because its bindings did exactly what good bindings are
      supposed to do. The chief's theory was that he had got the idea from a
      nineteen sixty-four heist film called Topkapi.`,
    sources: [WIDENER],
  },
  {
    id: "widener-flowers",
    subject: "widener-library",
    angle: "detail",
    depth: 2,
    tags: ["detail", "people"],
    text: `One small thing that is true. In the Memorial Rooms there are fresh
      flowers, and they are replaced every week, paid for by the Widener family
      as part of the upkeep they still underwrite. They were originally roses.
      They are carnations now. Student tour guides have built several fake
      stories on top of this real one, including that the flowers appear
      mysteriously in the morning, and that Harry used to have carnations dyed
      crimson. Neither is true. The flowers themselves are.`,
    sources: [WIDENER],
  },

  /* ----------------------------------------------- Widener steps --- */
  {
    id: "widener-steps-arrival",
    subject: "widener-steps",
    angle: "detail",
    depth: 1,
    arrival: true,
    tags: ["detail", "architecture"],
    look: "up the full run of the steps",
    text: `Worth standing at the bottom of these steps and looking up. This
      staircase is doing a job: it makes you climb to reach books. That was a
      deliberate nineteen fifteen argument about what a library is.`,
    sources: [WIDENER],
  },
  {
    id: "widener-steps-view",
    subject: "widener-steps",
    angle: "architecture",
    depth: 2,
    tags: ["architecture", "urbanism"],
    text: `Turn around at the top. From here you get the axis: down the steps,
      across Tercentenary Theatre, straight into Memorial Church. That
      alignment is the single strongest piece of urban design in the Yard, and
      it was created by putting the church where it is in nineteen thirty-two to
      answer a library from nineteen fifteen. Seventeen years apart, and they
      talk to each other.`,
    sources: [WIDENER, MEMCH],
  },

  /* --------------------------------------------- Memorial Church --- */
  {
    id: "memch-arrival",
    subject: "memorial-church",
    angle: "history",
    depth: 1,
    arrival: true,
    tags: ["history", "architecture"],
    look: "the white spire",
    text: `Memorial Church, nineteen thirty-two. It is a war memorial that
      happens to be a church, and it was dedicated on Armistice Day, the
      eleventh of November.`,
    sources: [MEMCH],
  },
  {
    id: "memch-wwi",
    subject: "memorial-church",
    angle: "history",
    depth: 2,
    requires: ["memch-arrival"],
    tags: ["history", "war", "people"],
    text: `Inside are the names of three hundred and seventy-three Harvard
      people who died in the First World War, alongside a sculpture called The
      Sacrifice by Malvina Hoffman. One detail I keep thinking about: the
      knight's face in that sculpture was modelled on Ian Henderson, a British
      flying ace who was killed in the war. Not an American. Memorials for later
      wars were added afterwards, for the Second World War, Korea and Vietnam.`,
    sources: [MEMCH],
  },
  {
    id: "memch-chapel-chain",
    subject: "memorial-church",
    angle: "history",
    depth: 3,
    tags: ["history", "religion", "architecture"],
    text: `There is a neat chain of buildings underneath this one. Harvard's
      first purpose-built place of worship was Holden Chapel in seventeen
      forty-four, back in the Old Yard. The college outgrew it, so worship moved
      into a chapel inside Harvard Hall in seventeen sixty-six, then into
      University Hall in eighteen fourteen, and then in eighteen fifty-eight
      into Appleton Chapel, which stood exactly where you are standing.
      Attendance at morning prayer was compulsory until eighteen eighty-six, and
      the moment it became voluntary Harvard had a building that was too big for
      weekday prayers and too small for Sundays. Appleton stood seventy-three
      years and was demolished after the nineteen thirty-one Commencement.
      Appleton's name survives inside: the part of Memorial Church that holds the
      daily Morning Prayer service is still called Appleton Chapel. So there is a
      roughly two hundred year sequence of Harvard building a chapel, outgrowing
      it, and absorbing the old name into the new building.`,
    sources: [MEMCH],
  },
  {
    id: "memch-bell",
    subject: "memorial-church",
    angle: "detail",
    depth: 2,
    tags: ["detail", "tech", "sound"],
    look: "the west portico, where the old bell is displayed",
    text: `Look for the bell on the west portico. Seven thousand pounds of
      bronze, cast in nineteen twenty-six by the John Taylor foundry in London,
      and it used to call students to class and to morning prayers. It is
      inscribed: in memory of the voices that are hushed. In twenty eleven it
      cracked, and the university concluded it could not be repaired. Then in
      twenty seventeen someone managed to restore it anyway, and rather than
      rehang it they put it on display where you can get close to it.`,
    sources: [MEMCH],
  },

  /* ------------------------------------------------------- Sever --- */
  {
    id: "sever-arrival",
    subject: "sever-hall",
    angle: "architecture",
    depth: 1,
    arrival: true,
    tags: ["architecture"],
    look: "the deep round arch in the middle of the west front",
    text: `Sever Hall. If you only look closely at one building in the Yard,
      make it this one. H. H. Richardson, eighteen eighty. And there is
      something you can do with that archway that most people walk straight
      past.`,
    sources: [SEVER],
  },
  {
    id: "sever-whisper",
    subject: "sever-hall",
    angle: "science",
    depth: 2,
    arrival: false,
    requires: ["sever-arrival"],
    tags: ["science", "acoustics", "interactive"],
    look: "the recessed semicircular archway on the west facade",
    text: `Go to the recessed arch on this west front. Stand at one edge of it,
      put your face close to the brick, and whisper. Someone at the other edge,
      about twelve feet away, will hear you clearly, and anyone standing in the
      middle will hear nothing. The curve of the arch is acting as a whispering
      gallery, guiding the sound along the surface instead of letting it spread.
      Richardson almost certainly did not design it deliberately. It is a side
      effect of the geometry that somebody eventually noticed.`,
    sources: [SEVER],
  },
  {
    id: "sever-bricks",
    subject: "sever-hall",
    angle: "architecture",
    depth: 3,
    tags: ["architecture", "materials", "craft"],
    look: "the moulded and carved brickwork around the windows",
    text: `Now look at the brick itself, because this is the best brickwork in
      Cambridge and it is easy to miss. Sever used about one point three million
      bricks. Roughly a hundred thousand of those are in the exterior faces you
      can see, and among those hundred thousand there are sixty different
      varieties of moulded red brick, plus elaborate carving done directly into
      the brick. Richardsonian Romanesque is normally a stone style, all rough
      granite and heavy arches. Richardson did this one in brick instead, which
      meant every profile and ornament that would have been carved in stone had
      to be either moulded before firing or cut afterwards. The original mortar
      was blood mortar, which is exactly what it sounds like: animal blood used
      as a binder and colourant to make the joints disappear into the brick.
      Robert Venturi, who spent his career arguing against heroic modernism,
      called Sever his favourite building in America. He told a critic: I love
      Sever Hall for its aesthetic tension deriving from its vital details. I
      could stand and look at it all day. Thank you, H. H. Richardson.`,
    sources: [SEVER],
  },
  {
    id: "sever-fourth-floor",
    subject: "sever-hall",
    angle: "detail",
    depth: 1,
    tags: ["detail", "trivia"],
    text: `One piece of trivia about this building that I love. There is a
      fourth floor, inside the roof, full of offices, and most of the students
      who study here have no idea it exists, because the central staircase
      simply does not go up to it.`,
    sources: [SEVER],
  },

  /* ----------------------------------------------------- Emerson --- */
  {
    id: "emerson-arrival",
    subject: "emerson-hall",
    angle: "detail",
    depth: 1,
    arrival: true,
    tags: ["detail", "history", "philosophy"],
    look: "the inscription carved high on the facade",
    text: `Emerson Hall, home of the philosophy department. Look up at the
      inscription. It reads: what is man that thou art mindful of him. There is
      a story about how that got there.`,
    sources: [YARD],
  },
  {
    id: "emerson-inscription",
    subject: "emerson-hall",
    angle: "people",
    depth: 2,
    requires: ["emerson-arrival"],
    tags: ["people", "philosophy", "history"],
    text: `The line is from Psalm Eight. The story told around the department
      is that the philosophers, William James among them, proposed a line from
      the Greek philosopher Protagoras instead: man is the measure of all
      things. And that Harvard's president, Charles Eliot, quietly overruled
      them and had the psalm carved instead, putting God back at the centre of
      the philosophy building. I should flag that this is departmental folklore
      rather than something I can source properly, but the inscription is
      absolutely there, and it is a very pointed thing to carve above a room
      full of pragmatists.`,
    sources: [YARD],
  },
];
