(letrec
    ((i 0)
     (loop
      (lambda ()
        (if (== i 10)
            #t
            (begin
              (display "i = ")
              (display i)
              (newline)
              (set! i (+ i 1))
              (loop))))))
  (loop))
