(cons
 "before-"
 (cons
  (letrec
      ((value (input test)))
    (if (eqv? (mod value 2) 0)
        (cons "even" (cons value '()))
        (cons "odd" (cons value '()))))
  (cons "-after" '())))
