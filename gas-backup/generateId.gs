function generateStudentID(name) {
  // Gets the first 3 characters of the name
    var namePart = name.substring(0, 3);

    // Gets the current timestamp
    var timestamp = new Date().getTime();

    // Concatenates the name part and the timestamp to form the ID
    var id = namePart.toUpperCase() + '_' + timestamp;

    return id;
}
